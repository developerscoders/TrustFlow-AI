import {NextResponse} from 'next/server';
import {z} from 'zod';
import {currentUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {capturePayPalOrder,getPayPalOrder,paypalConfigured} from '@/lib/paypal';
import {audit,notifyUsers} from '@/lib/events';
import {sendWorkflowEmail} from '@/lib/mailer';
import {mutationError,rateLimit} from '@/lib/security';
import {verifyCompletedOrder} from '@/lib/payment-verification';
import {captureApprovedPayPalOrder} from '@/lib/paypal-capture';
import {resolvePayPalCheckoutConfiguration} from '@/lib/paypal-checkout-config';
const input=z.object({orderId:z.string().min(1).max(200)});
export async function POST(req:Request){
 const invalid=mutationError(req);if(invalid)return invalid;
 const user=await currentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 if(!rateLimit(`capture:${user.id}`,10))return NextResponse.json({error:'Too many capture requests.'},{status:429});
 if(!paypalConfigured())return NextResponse.json({error:'PayPal Sandbox configuration required.',configured:false},{status:503});
 let raw:unknown;try{raw=await req.json()}catch{return NextResponse.json({error:'Invalid JSON.'},{status:400})}
 const value=input.safeParse(raw);if(!value.success)return NextResponse.json({error:'Invalid PayPal order.'},{status:400});
 const payment=await db.payment.findUnique({where:{paypalOrderId:value.data.orderId},include:{deal:{include:{provider:{select:{paypalMerchantEmail:true}}}}}});
 if(!payment||payment.deal.buyerId!==user.id)return NextResponse.json({error:'Payment order not found.'},{status:404});
 if(payment.status==='COMPLETED')return NextResponse.json({status:'COMPLETED',verified:true});
 let sellerEmail=payment.paypalSellerEmail;
 let sellerMerchantId=payment.paypalSellerMerchantId;
 if(!sellerEmail||!sellerMerchantId){
  const configuration=resolvePayPalCheckoutConfiguration(payment.deal.provider?.paypalMerchantEmail);
  if(!configuration.ok)return NextResponse.json({error:'This older payment has no saved merchant identity. Configure and verify the Sandbox Business account before TrustFlow can reconcile it.',code:configuration.code},{status:503});
  sellerEmail=configuration.merchantEmail;
  sellerMerchantId=configuration.merchantId;
 }
 try{
  let order=await getPayPalOrder(payment.paypalOrderId);
  if(order.status==='APPROVED'){
   await db.payment.updateMany({where:{id:payment.id,status:{in:['CREATED','APPROVED','CAPTURE_PENDING']}},data:{status:'CAPTURE_PENDING'}});
   order=await captureApprovedPayPalOrder(order,payment.paypalOrderId,'trustflow-capture-'+payment.id,{captureOrder:capturePayPalOrder,getOrder:getPayPalOrder});
  }else if(order.status!=='COMPLETED'){
   return NextResponse.json({error:'PayPal order has not been approved yet.'},{status:409});
  }
  if(order.status==='APPROVED'){await db.payment.updateMany({where:{id:payment.id,status:'CAPTURE_PENDING'},data:{status:'APPROVED'}});return NextResponse.json({error:'PayPal has not completed the capture yet. Retry shortly.'},{status:502})}
  const capture=order.purchase_units?.[0]?.payments?.captures?.[0];
  if(capture?.status==='PENDING'){await db.payment.updateMany({where:{id:payment.id,status:{not:'COMPLETED'}},data:{status:'CAPTURE_PENDING'}});return NextResponse.json({status:'CAPTURE_PENDING',verified:false},{status:202})}
  if(!verifyCompletedOrder(order,{orderId:payment.paypalOrderId,dealId:payment.dealId,amount:payment.amount,currency:payment.currency,paypalSellerEmail:sellerEmail,paypalSellerMerchantId:sellerMerchantId},capture?.id)){
   await db.payment.update({where:{id:payment.id},data:{status:'FAILED',failureReason:'PayPal order/capture amount, currency, reference or status verification failed.'}});
   await audit(payment.dealId,'PAYMENT_FAILED','PayPal capture could not be verified; no payment success was recorded.',user.name,user.id,{type:'PAYMENT',id:payment.id});
   await notifyUsers([payment.deal.buyerId,...(payment.deal.providerId?[payment.deal.providerId]:[])],payment.dealId,'Payment verification failed','PayPal could not verify this payment. Please review the deal payment status.','PAYMENT');
   return NextResponse.json({error:'PayPal capture verification failed.'},{status:409});
  }
  const updated=await db.payment.updateMany({where:{id:payment.id,status:{not:'COMPLETED'}},data:{status:'COMPLETED',paypalSellerEmail:sellerEmail,paypalSellerMerchantId:sellerMerchantId,captureId:capture.id,paypalPayerId:order.payer?.payer_id||null,failureReason:null}});
  if(updated.count){
   await audit(payment.dealId,'PAYMENT_VERIFIED','PayPal capture verified server-side.',user.name,user.id,{type:'PAYMENT',id:payment.id});
   const providerId=payment.deal.providerId;
   if(providerId){
    await notifyUsers([providerId],payment.dealId,'Payment verified',`PayPal confirmed payment for ${payment.deal.title}.`,'PAYMENT');
    const recipient=await db.user.findUnique({where:{id:providerId}});
    if(recipient)void sendWorkflowEmail({dealId:payment.dealId,to:recipient.email,type:'PAYMENT_VERIFIED',dealTitle:payment.deal.title,message:'PayPal confirmed payment for this deal.',key:`payment-${payment.id}-${recipient.id}`}).catch(()=>null);
   }
  }
  return NextResponse.json({status:'COMPLETED',verified:true});
 }catch(error){
  const latest=await db.payment.findUnique({where:{id:payment.id}});if(latest?.status==='COMPLETED')return NextResponse.json({status:'COMPLETED',verified:true});
  await db.payment.updateMany({where:{id:payment.id,status:'CAPTURE_PENDING'},data:{status:'APPROVED',failureReason:error instanceof Error?error.message:'Capture verification temporarily unavailable'}});
  return NextResponse.json({error:'PayPal capture could not be verified. You can retry safely.'},{status:502});
 }
}
