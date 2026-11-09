import {db} from './db';
import {emailTemplate,EmailTemplateType} from './email-templates';
import {retryDelay} from './security';
import {audit} from './events';
type EmailInput={dealId:string;to:string;type:string;title:string;message:string;key:string;html?:string};
export async function sendWorkflowEmail(input:{dealId:string;to:string;type:EmailTemplateType;dealTitle:string;message:string;key:string}){
 const base=(process.env.NEXT_PUBLIC_APP_URL||'http://localhost:3000').replace(/\/$/,'');
 const view=emailTemplate(input.type,input.dealTitle,input.message,`${base}/deals/${encodeURIComponent(input.dealId)}`);
 return sendDealEmail({...input,title:view.subject,html:view.html});
}
export async function sendDealEmail(input:EmailInput){
 const to=input.to.trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))return {ok:false,status:'FAILED',reason:'Invalid recipient'} as const;
 let log=await db.emailLog.findUnique({where:{idempotencyKey:input.key}});
 if(log&&(log.status==='SENT'||log.status==='DELIVERED'||log.status==='OPENED'||log.status==='CLICKED'))return {ok:true,status:log.status,duplicate:true} as const;
 if(!log){
  try{log=await db.emailLog.create({data:{dealId:input.dealId,toEmail:to,type:input.type,idempotencyKey:input.key,status:'QUEUED'}})}
  catch{log=await db.emailLog.findUnique({where:{idempotencyKey:input.key}});if(!log)return {ok:false,status:'FAILED',reason:'Could not persist email attempt'} as const}
 }
 if(log.toEmail.toLowerCase()!==to||log.dealId!==input.dealId||log.type!==input.type)return {ok:false,status:'FAILED',reason:'Email idempotency key conflict'} as const;
 if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM){
  await db.emailLog.update({where:{id:log.id},data:{status:'FAILED',attempts:{increment:1},lastError:'Resend configuration required',nextAttemptAt:null}});
  return {ok:false,status:'FAILED',reason:'Resend configuration required'} as const;
 }
 try{
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':input.key},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[to],subject:input.title,html:input.html||fallbackHtml(input.title,input.message,input.dealId)})});
  const value=await response.json() as {id?:string};
  if(!response.ok||!value.id)throw new Error('Resend request failed');
  await db.emailLog.update({where:{id:log.id},data:{status:'SENT',resendId:value.id,attempts:{increment:1},lastError:null,nextAttemptAt:null}});
  try{await audit(input.dealId,'EMAIL_SENT',`Email sent: ${input.type}.`,'Resend',undefined,{type:'EMAIL',id:log.id,metadata:{emailType:input.type}})}catch{}
  return {ok:true,status:'SENT'} as const;
 }catch{
  await db.emailLog.update({where:{id:log.id},data:{status:'FAILED',attempts:{increment:1},lastError:'Resend send failed',nextAttemptAt:new Date(Date.now()+retryDelay(log.attempts+1))}});
  return {ok:false,status:'FAILED',reason:'Resend send failed'} as const;
 }
}
export const sendDealInvitation=(input:Omit<Parameters<typeof sendWorkflowEmail>[0],'type'>)=>sendWorkflowEmail({...input,type:'DEAL_INVITATION'});
export const sendAgreementApproved=(input:Omit<Parameters<typeof sendWorkflowEmail>[0],'type'>)=>sendWorkflowEmail({...input,type:'AGREEMENT_APPROVED'});
export const sendPaymentVerified=(input:Omit<Parameters<typeof sendWorkflowEmail>[0],'type'>)=>sendWorkflowEmail({...input,type:'PAYMENT_VERIFIED'});
export const sendEvidenceSubmitted=(input:Omit<Parameters<typeof sendWorkflowEmail>[0],'type'>)=>sendWorkflowEmail({...input,type:'EVIDENCE_SUBMITTED'});
export const sendAssessmentResult=(input:Omit<Parameters<typeof sendWorkflowEmail>[0],'type'>)=>sendWorkflowEmail({...input,type:'ASSESSMENT_RESULT'});
export const sendRevisionRequested=(input:Omit<Parameters<typeof sendWorkflowEmail>[0],'type'>)=>sendWorkflowEmail({...input,type:'REVISION_REQUESTED'});
export const sendDisputeOpened=(input:Omit<Parameters<typeof sendWorkflowEmail>[0],'type'>)=>sendWorkflowEmail({...input,type:'DISPUTE_OPENED'});
function fallbackHtml(title:string,message:string,dealId:string){const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string));const base=(process.env.NEXT_PUBLIC_APP_URL||'http://localhost:3000').replace(/\/$/,'');return `<main style="background:#FBF7F0;padding:32px;font:16px Arial;color:#1F2937"><section style="max-width:560px;margin:auto;background:#FFFDF8;padding:28px;border:1px solid #EADFCB;border-radius:16px"><h1 style="color:#2F5BEA">TrustFlow AI</h1><h2>${escape(title)}</h2><p>${escape(message)}</p><a href="${escape(base+'/deals/'+encodeURIComponent(dealId))}">Open deal</a></section></main>`}