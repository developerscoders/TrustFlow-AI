import {NextResponse} from 'next/server';
import {z} from 'zod';
import {currentUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {capturePayPalOrder,getPayPalOrder,paypalConfigured} from '@/lib/paypal';
import {audit,notifyUsers} from '@/lib/events';
import {sendWorkflowEmail} from '@/lib/mailer';
import {mutationError,rateLimit} from '@/lib/security';
const input=z.object({orderId:z.string().min(1).max(200)});
const money=(value:unknown)=>typeof value==='string'&&/^\d+\.\d{2}$/.test(value)?Math.round(Number(value)*100):Number.NaN;
export async function POST(req:Request){
 const invalid=mutationError(req);if(invalid)return invalid;
 const user=await currentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 if(!rateLimit(`capture:${user.id}`,10))return NextResponse.json({error:'Too many capture requests.'},{status:429});
 if(!paypalConfigured())return NextResponse.json({error:'PayPal Sandbox configuration required.',configured:false},{status:503});
 let raw:unknown;try{raw=await req.json()}catch{return NextResponse.json({error:'Invalid JSON.'},{status:400})}
 const value=input.safeParse(raw);if(!value.success)return NextResponse.json({error:'Invalid PayPal order.'},{status:400});
 const payment=await db.payment.findUnique({where:{paypalOrderId:value.data.orderId},include:{deal:true}});
 if(!payment||payment.deal.buyerId!==user.id)return NextResponse.json({error:'Payment order not found.'},{status:404});
 if(payment.status==='COMPLETED')return NextResponse.json({status:'COMPLETED',verified:true});
 try{
  await db.payment.updateMany({where:{id:payment.id,status:{in:['CREATED','APPROVED','CAPTURE_PENDING']}},data:{status:'CAPTURE_PENDING'}});
  let order=await getPayPalOrder(payment.paypalOrderId);
  let capture=order.purchase_units?.[0]?.payments?.captures?.[0];
  if(order.status!=='COMPLETED'||!capture){
   try{order=await capturePayPalOrder(payment.paypalOrderId,`trustflow-capture-${payment.id}`)}catch{
    order=await getPayPalOrder(payment.paypalOrderId);
   }
   capture=order.purchase_units?.[0]?.payments?.captures?.[0];
  }
  const unit=order.purchase_units?.find((x:any)=>x.custom_id===payment.dealId||x.reference_id===payment.dealId);
  if(order.id!==payment.paypalOrderId||order.status!=='COMPLETED'||!unit||!capture||capture.status!=='COMPLETED'||capture.id==null||unit.amount?.currency_code!==payment.currency||money(unit.amount?.value)!==payment.amount||capture.amount?.currency_code!==payment.currency||money(capture.amount?.value)!==payment.amount){
   await db.payment.update({where:{id:payment.id},data:{status:'FAILED',failureReason:'PayPal order/capture amount, currency, reference or status verification failed.'}});
   return NextResponse.json({error:'PayPal capture verification failed.'},{status:409});
  }
  const updated=await db.payment.updateMany({where:{id:payment.id,status:{not:'COMPLETED'}},data:{status:'COMPLETED',captureId:capture.id,paypalPayerId:order.payer?.payer_id||null,failureReason:null}});
  if(updated.count){
   await audit(payment.dealId,'PAYMENT_VERIFIED','PayPal capture verified server-side.',user.name,user.id,{type:'PAYMENT',id:payment.id});
   const providerId=payment.deal.providerId;
   if(providerId){
    await notifyUsers([providerId],payment.dealId,'Payment verified',`PayPal confirmed payment for ${payment.deal.title}.`,'PAYMENT');
    const recipient=await db.user.findUnique({where:{id:providerId}});
    if(recipient)void sendWorkflowEmail({dealId:payment.dealId,to:recipient.email,type:'PAYMENT_VERIFIED',dealTitle:payment.deal.title,message:'PayPal confirmed payment for this deal.',key:`payment-${payment.id}-${recipient.id}`});
   }
  }
  return NextResponse.json({status:'COMPLETED',verified:true});
 }catch(error){
  await db.payment.updateMany({where:{id:payment.id,status:'CAPTURE_PENDING'},data:{status:'FAILED',failureReason:error instanceof Error?error.message:'Capture verification failed'}});
  return NextResponse.json({error:'PayPal capture could not be verified. You can retry safely.'},{status:502});
 }
}
