import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {audit,notifyUsers} from '@/lib/events';
import {verifyResendWebhookSignature} from '@/lib/resend-webhook';
const rank:Record<string,number>={QUEUED:0,FAILED:0,SENT:1,DELIVERED:2,OPENED:3,CLICKED:4,BOUNCED:5};
export async function POST(req:Request){
 const raw=await req.text(),id=req.headers.get('svix-id')||'',at=req.headers.get('svix-timestamp')||'',signature=req.headers.get('svix-signature')||'',secret=process.env.RESEND_WEBHOOK_SECRET;
 if(!secret||!verifyResendWebhookSignature({rawBody:raw,id,timestamp:at,signature,secret}))return NextResponse.json({error:'Invalid webhook signature.'},{status:400});
 try{
  const payload=JSON.parse(raw) as {type?:unknown;data?:{email_id?:unknown;id?:unknown}};
  if(typeof payload.type!=='string')return NextResponse.json({error:'Malformed webhook event.'},{status:400});
  const type=payload.type,emailId=String(payload.data?.email_id||payload.data?.id||'');
  let event=await db.webhookEvent.findUnique({where:{providerEventId:`resend:${id}`}});
  if(event?.processedAt)return NextResponse.json({received:true,duplicate:true});
  if(!event){try{event=await db.webhookEvent.create({data:{providerEventId:`resend:${id}`,type}})}catch{event=await db.webhookEvent.findUnique({where:{providerEventId:`resend:${id}`}});if(event?.processedAt)return NextResponse.json({received:true,duplicate:true});if(!event)return NextResponse.json({error:'Could not persist webhook event.'},{status:503})}}
  const statusByType:Record<string,string>={'email.sent':'SENT','email.delivered':'DELIVERED','email.opened':'OPENED','email.clicked':'CLICKED','email.bounced':'BOUNCED'};
  const status=statusByType[type];
  if(!status){await db.webhookEvent.update({where:{id:event.id},data:{processedAt:new Date(),processingError:null}});return NextResponse.json({received:true,ignored:true})}
  if(!emailId)throw new Error('Email provider ID missing.');
  const log=await db.emailLog.findFirst({where:{resendId:emailId}});
  if(!log){await db.webhookEvent.update({where:{id:event.id},data:{processingError:'EmailLog not yet linked to Resend message ID; awaiting provider retry.'}});return NextResponse.json({error:'Email delivery record is not ready yet. Retry this webhook.'},{status:503})}
  const changed=(rank[status]??0)>(rank[log.status]??0)||log.status==='FAILED'||log.status==='QUEUED';
  if(changed){
   await db.emailLog.update({where:{id:log.id},data:{status,...(status==='OPENED'?{openedAt:new Date()}:{}),...(status==='CLICKED'?{clickedAt:new Date()}:{})}});
   const deal=await db.deal.findUnique({where:{id:log.dealId}});
   if(deal){
    await audit(deal.id,`EMAIL_${status}`,status==='OPENED'?'Email likely opened.':status==='CLICKED'?'Email link clicked.':`Email ${status.toLowerCase()}.`,'Resend',undefined,{type:'EMAIL',id:log.id});
    if(status==='BOUNCED')await notifyUsers([deal.buyerId,...(deal.providerId?[deal.providerId]:[])],deal.id,'Email bounced','An email notification could not be delivered.','EMAIL');
   }
  }
  await db.webhookEvent.update({where:{id:event.id},data:{processedAt:new Date(),processingError:null}});
  return NextResponse.json({received:true});
 }catch{
  const event=await db.webhookEvent.findUnique({where:{providerEventId:`resend:${id}`}});
  if(event)await db.webhookEvent.update({where:{id:event.id},data:{processingError:'Webhook processing failed.'}});
  return NextResponse.json({error:'Webhook processing failed.'},{status:503});
 }
}