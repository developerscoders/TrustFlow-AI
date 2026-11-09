import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {getPayPalOrder,paypalConfigured,verifyPayPalWebhook} from '@/lib/paypal';
import {audit,notifyUsers} from '@/lib/events';
import {sendWorkflowEmail} from '@/lib/mailer';
import {validWebhookCapture,verifyCompletedOrder} from '@/lib/payment-verification';
export async function POST(req:Request){
 if(!paypalConfigured()||!process.env.PAYPAL_WEBHOOK_ID)return NextResponse.json({error:'PayPal webhook configuration required.'},{status:503});
 let event:any;try{event=await req.json()}catch{return NextResponse.json({error:'Invalid webhook JSON.'},{status:400})}
 if(!event?.id||typeof event.event_type!=='string')return NextResponse.json({error:'Malformed webhook event.'},{status:400});
 try{
  const verified=await verifyPayPalWebhook(req.headers,event);
  if(!verified)return NextResponse.json({error:'Invalid PayPal signature.'},{status:400});
 }catch{return NextResponse.json({error:'PayPal signature verification unavailable.'},{status:502})}
 const providerEventId=`paypal:${event.id}`;
 let record=await db.webhookEvent.findUnique({where:{providerEventId}});
 if(record?.processedAt)return NextResponse.json({received:true,duplicate:true});
 if(!record){try{record=await db.webhookEvent.create({data:{providerEventId,type:event.event_type,payload:JSON.stringify(event)}})}catch{record=await db.webhookEvent.findUnique({where:{providerEventId}});if(record?.processedAt)return NextResponse.json({received:true,duplicate:true});if(!record)return NextResponse.json({error:'Could not persist webhook event.'},{status:503})}}
 try{
  if(event.event_type==='PAYMENT.CAPTURE.COMPLETED'){
   const capture=event.resource;
   const orderId=capture?.supplementary_data?.related_ids?.order_id;
   if(!orderId||capture?.status!=='COMPLETED'||typeof capture.id!=='string')throw new Error('Capture event is missing a completed order reference.');
   const payment=await db.payment.findUnique({where:{paypalOrderId:orderId},include:{deal:true}});
   if(!payment)throw new Error('Payment order not found for capture event.');
   const order=await getPayPalOrder(orderId);
   if(!validWebhookCapture(event,{orderId,dealId:payment.dealId,amount:payment.amount,currency:payment.currency})||!verifyCompletedOrder(order,{orderId,dealId:payment.dealId,amount:payment.amount,currency:payment.currency},capture.id))throw new Error('Capture amount, currency, order reference or status did not reconcile.');
   const changed=await db.payment.updateMany({where:{id:payment.id,status:{not:'COMPLETED'}},data:{status:'COMPLETED',captureId:capture.id,paypalPayerId:order.payer?.payer_id||null,failureReason:null}});
   if(changed.count){
    await audit(payment.dealId,'PAYMENT_VERIFIED','PayPal capture webhook verified against the order.','PayPal',undefined,{type:'PAYMENT',id:payment.id});
    if(payment.deal.providerId){
     await notifyUsers([payment.deal.providerId],payment.dealId,'Payment verified',`PayPal confirmed payment for ${payment.deal.title}.`,'PAYMENT');
     const recipient=await db.user.findUnique({where:{id:payment.deal.providerId}});
     if(recipient)void sendWorkflowEmail({dealId:payment.dealId,to:recipient.email,type:'PAYMENT_VERIFIED',dealTitle:payment.deal.title,message:'PayPal confirmed payment for this deal.',key:`payment-${payment.id}-${recipient.id}`});
    }
   }
  }else if(event.event_type==='CHECKOUT.ORDER.APPROVED'){
   const orderId=event.resource?.id;if(orderId)await db.payment.updateMany({where:{paypalOrderId:orderId,status:'CREATED'},data:{status:'APPROVED'}});
  }else if(event.event_type==='CHECKOUT.ORDER.VOIDED'){
   const orderId=event.resource?.id;if(orderId)await db.payment.updateMany({where:{paypalOrderId:orderId,status:{not:'COMPLETED'}},data:{status:'CANCELLED',failureReason:null}});
  }else if(event.event_type==='PAYMENT.CAPTURE.PENDING'){
   const orderId=event.resource?.supplementary_data?.related_ids?.order_id;if(orderId)await db.payment.updateMany({where:{paypalOrderId:orderId,status:{not:'COMPLETED'}},data:{status:'CAPTURE_PENDING'}});
  }else if(event.event_type==='PAYMENT.CAPTURE.DENIED'||event.event_type==='PAYMENT.CAPTURE.REFUNDED'){
   const orderId=event.resource?.supplementary_data?.related_ids?.order_id;
   if(orderId){const payment=await db.payment.findUnique({where:{paypalOrderId:orderId}});if(payment&&payment.status!=='COMPLETED')await db.payment.update({where:{id:payment.id},data:{status:'FAILED',failureReason:event.event_type}})}
  }
  await db.webhookEvent.update({where:{id:record.id},data:{processedAt:new Date(),processingError:null}});
  return NextResponse.json({received:true});
 }catch(error){
  await db.webhookEvent.update({where:{id:record.id},data:{processingError:error instanceof Error?error.message:'Webhook processing failed.'}});
  return NextResponse.json({error:'Webhook event could not be reconciled; PayPal may retry.'},{status:503});
 }
}
