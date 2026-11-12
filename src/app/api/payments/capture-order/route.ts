import {NextResponse} from 'next/server';
import {z} from 'zod';
import {currentUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {capturePayPalOrder,getPayPalCapture,getPayPalOrder,paypalConfigured} from '@/lib/paypal';
import {audit,notifyUsers} from '@/lib/events';
import {sendWorkflowEmail} from '@/lib/mailer';
import {mutationError,rateLimit} from '@/lib/security';
import {verifyCompletedCapture,verifyCompletedOrder,verifyOrderTerms} from '@/lib/payment-verification';
import {captureApprovedPayPalOrder} from '@/lib/paypal-capture';
const input=z.object({orderId:z.string().min(1).max(200)});
const expectation=(payment:any)=>({orderId:payment.paypalOrderId,dealId:payment.dealId,amount:payment.amount,currency:payment.currency});
export async function POST(req:Request){
 const invalid=mutationError(req);if(invalid)return invalid;
 const user=await currentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 if(!rateLimit(`capture:${user.id}`,10))return NextResponse.json({error:'Too many capture requests.'},{status:429});
 if(!paypalConfigured())return NextResponse.json({error:'PayPal configuration required.',configured:false},{status:503});
 let raw:unknown;try{raw=await req.json()}catch{return NextResponse.json({error:'Invalid JSON.'},{status:400})}
 const value=input.safeParse(raw);if(!value.success)return NextResponse.json({error:'Invalid PayPal order.'},{status:400});
 const payment=await db.payment.findUnique({where:{paypalOrderId:value.data.orderId},include:{deal:true}});
 if(!payment||payment.deal.buyerId!==user.id)return NextResponse.json({error:'Payment order not found.'},{status:404});
 if(payment.status==='COMPLETED')return NextResponse.json({status:'COMPLETED',verified:true});
 const expected=expectation(payment);
 try{
  let order=await getPayPalOrder(payment.paypalOrderId);
  if(order.status==='APPROVED'){
   await db.payment.updateMany({where:{id:payment.id,status:{in:['CREATED','APPROVED','CAPTURE_PENDING']}},data:{status:'CAPTURE_PENDING',failureReason:null}});
   order=await captureApprovedPayPalOrder(order,payment.paypalOrderId,'trustflow-capture-'+payment.id,{captureOrder:capturePayPalOrder,getOrder:getPayPalOrder});
  }
  let unit=order.purchase_units?.find((item:any)=>item.custom_id===payment.dealId||item.reference_id===payment.dealId);
  let captures=unit?.payments?.captures||[];
  let capture=captures.find((item:any)=>item.status==='COMPLETED')||captures.find((item:any)=>item.status==='PENDING');
  // PayPal can acknowledge a successful capture before the order GET resource
  // catches up. Verify the capture resource directly, but still bind it to the
  // stored order ID, deal reference, amount and currency before recording paid.
  if(capture?.id&&verifyOrderTerms(order,expected)&&!verifyCompletedOrder(order,expected,capture.id)){
   try{
    const freshOrder=await getPayPalOrder(payment.paypalOrderId);
    if(verifyCompletedOrder(freshOrder,expected,capture.id)){order=freshOrder;unit=freshOrder.purchase_units?.find((item:any)=>item.custom_id===payment.dealId||item.reference_id===payment.dealId);captures=unit?.payments?.captures||[];capture=captures.find((item:any)=>item.id===capture.id)||capture;}
   }catch{/* Continue to the capture-resource lookup below. */}
  }
  let verified=verifyCompletedOrder(order,expected,capture?.id);
  if(!verified&&capture?.id&&verifyOrderTerms(order,expected)){
   const captureResource=await getPayPalCapture(capture.id);
   verified=verifyCompletedCapture(captureResource,expected);
   if(verified)capture=captureResource;
  }
  if(!verified){
   if(capture?.status==='PENDING'||order.status==='APPROVED'||order.status==='COMPLETED'){
    await db.payment.updateMany({where:{id:payment.id,status:{not:'COMPLETED'}},data:{status:'CAPTURE_PENDING',failureReason:null}});
    return NextResponse.json({status:'CAPTURE_PENDING',verified:false,message:'PayPal has not exposed a final completed capture yet.'},{status:202});
   }
   return NextResponse.json({error:'PayPal order is not ready for capture verification.'},{status:409});
  }
  const updated=await db.payment.updateMany({where:{id:payment.id,status:{not:'COMPLETED'}},data:{status:'COMPLETED',captureId:capture.id,paypalPayerId:order.payer?.payer_id||null,failureReason:null}});
  if(updated.count){
   await audit(payment.dealId,'PAYMENT_VERIFIED','PayPal capture verified server-side against the order and capture resource.',user.name,user.id,{type:'PAYMENT',id:payment.id});
   const providerId=payment.deal.providerId;
   if(providerId){
    await notifyUsers([providerId],payment.dealId,'Payment verified',`PayPal confirmed payment for ${payment.deal.title}.`,'PAYMENT');
    const recipient=await db.user.findUnique({where:{id:providerId}});
    if(recipient)void sendWorkflowEmail({dealId:payment.dealId,to:recipient.email,type:'PAYMENT_VERIFIED',dealTitle:payment.deal.title,message:'PayPal confirmed payment for this deal.',key:`payment-${payment.id}-${recipient.id}`}).catch(()=>null);
   }
  }
  return NextResponse.json({status:'COMPLETED',verified:true,captureId:capture.id});
 }catch(error){
  const latest=await db.payment.findUnique({where:{id:payment.id}});
  if(latest?.status==='COMPLETED')return NextResponse.json({status:'COMPLETED',verified:true});
  await db.payment.updateMany({where:{id:payment.id,status:{in:['CREATED','APPROVED','CAPTURE_PENDING']}},data:{status:'CAPTURE_PENDING',failureReason:error instanceof Error?error.message:'Capture verification temporarily unavailable'}});
  return NextResponse.json({status:'CAPTURE_PENDING',verified:false,error:'PayPal capture confirmation is not available yet. TrustFlow will safely reconcile the existing order.'},{status:202});
 }
}
