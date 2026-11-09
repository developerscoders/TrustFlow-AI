import {NextResponse} from 'next/server';
import {z} from 'zod';
import {currentUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {audit,notifyUsers} from '@/lib/events';
import {mutationError} from '@/lib/security';
import {sendWorkflowEmail} from '@/lib/mailer';
const input=z.object({action:z.enum(['REQUEST_REVISION','HUMAN_REVIEW']),note:z.string().trim().max(2000).optional()});
export async function POST(req:Request,{params}:{params:{id:string}}){
 const invalid=mutationError(req);if(invalid)return invalid;
 const user=await currentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 let raw:unknown;try{raw=await req.json()}catch{return NextResponse.json({error:'Invalid JSON.'},{status:400})}
 const value=input.safeParse(raw);if(!value.success)return NextResponse.json({error:'Choose a valid review action.'},{status:400});
 const submission=await db.submission.findUnique({where:{id:params.id},include:{deal:true}});
 if(!submission||![submission.deal.buyerId,submission.deal.providerId].includes(user.id))return NextResponse.json({error:'Submission not found.'},{status:404});
 if(value.data.action==='REQUEST_REVISION'&&submission.deal.buyerId!==user.id)return NextResponse.json({error:'Only the buyer can request a revision.'},{status:403});
 const status=value.data.action==='REQUEST_REVISION'?'REVISION_REQUESTED':'HUMAN_REVIEW_REQUESTED';
 await db.submission.update({where:{id:submission.id},data:{status}});
 const message=value.data.action==='REQUEST_REVISION'?'Buyer requested a revision for the submitted evidence.':'A participant requested human review of the submitted evidence.';
 await audit(submission.dealId,status,message,user.name,user.id,{type:'SUBMISSION',id:submission.id,metadata:{note:value.data.note||''}});
 const recipientIds=value.data.action==='REQUEST_REVISION'&&submission.deal.providerId?[submission.deal.providerId]:[submission.deal.buyerId,...(submission.deal.providerId?[submission.deal.providerId]:[])].filter(id=>id!==user.id);
 await notifyUsers(recipientIds,submission.dealId,value.data.action==='REQUEST_REVISION'?'Revision requested':'Human review requested',value.data.note?message+' Note: '+value.data.note:message,'REVIEW');
 if(value.data.action==='REQUEST_REVISION'&&submission.deal.providerId){
  const recipient=await db.user.findUnique({where:{id:submission.deal.providerId}});
  if(recipient)void sendWorkflowEmail({dealId:submission.dealId,to:recipient.email,type:'REVISION_REQUESTED',dealTitle:submission.deal.title,message:value.data.note?message+' Note: '+value.data.note:message,key:'revision-'+submission.id+'-'+Date.now()});
 }
 return NextResponse.json({status});
}
