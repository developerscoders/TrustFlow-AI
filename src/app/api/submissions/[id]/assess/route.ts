import {NextResponse} from 'next/server';
import {currentUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {verifyEvidence} from '@/lib/ai';
import {audit,notifyUsers} from '@/lib/events';
import {sendWorkflowEmail} from '@/lib/mailer';
import {mutationError,rateLimit} from '@/lib/security';
import {readEvidenceFile} from '@/lib/private-storage';
export async function GET(_:Request,{params}:{params:{id:string}}){
 const user=await currentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const submission=await db.submission.findUnique({where:{id:params.id},include:{deal:true}});
 if(!submission||![submission.deal.buyerId,submission.deal.providerId].includes(user.id))return NextResponse.json({error:'Not found.'},{status:404});
 const assessment=await db.assessment.findUnique({where:{submissionId:submission.id}});
 return NextResponse.json(assessment?[assessment]:[]);
}
export async function POST(req:Request,{params}:{params:{id:string}}){
 const invalid=mutationError(req);if(invalid)return invalid;
 const user=await currentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 if(!rateLimit('assessment-retry:'+user.id,8))return NextResponse.json({error:'Too many assessment retries.'},{status:429});
 const submission=await db.submission.findUnique({where:{id:params.id},include:{deal:true}});
 if(!submission||![submission.deal.buyerId,submission.deal.providerId].includes(user.id))return NextResponse.json({error:'Submission not found.'},{status:404});
 if(submission.status==='ASSESSED')return NextResponse.json({error:'This submission already has an assessment.'},{status:409});
 const previous=await db.assessment.findUnique({where:{submissionId:submission.id}});if(previous){const restored={overallScore:previous.overallScore,status:previous.status,criteriaResults:JSON.parse(previous.criteriaResults),missingEvidence:JSON.parse(previous.missingEvidence),concerns:JSON.parse(previous.concerns),recommendation:previous.recommendation,explanation:previous.explanation};await db.submission.update({where:{id:submission.id},data:{status:'ASSESSED',assessment:JSON.stringify(restored)}});return NextResponse.json({status:'ASSESSED',assessment:restored,assessmentId:previous.id,reused:true})}
 const milestone=await db.milestone.findUnique({where:{id:submission.milestoneId}});
 const version=await db.agreementVersion.findUnique({where:{dealId_version:{dealId:submission.dealId,version:submission.agreementVersion}}});
 if(!milestone||!version?.buyerApprovedAt||!version.providerApprovedAt)return NextResponse.json({error:'The exact approved agreement version for this submission is unavailable.'},{status:409});
 let criteria:string[]=[];try{const parsed=JSON.parse(version.acceptanceCriteria||'[]');if(Array.isArray(parsed))criteria=parsed.filter((x:unknown)=>typeof x==='string')}catch{}if(!criteria.length)throw new Error('APPROVED_ACCEPTANCE_CRITERIA_NOT_FOUND');
 const files=JSON.parse(submission.fileMetadata||'[]') as any[],fileContext:string[]=[];
 for(const file of files){if(file.contentType==='text/plain'){try{fileContext.push('Text file '+file.filename+': '+(await readEvidenceFile(file.storageKey)).toString('utf8').slice(0,8000))}catch{fileContext.push('File '+file.filename+' is unavailable and unverifiable.')}}else fileContext.push('File '+file.filename+' is attached but its content has not been extracted; mark relevant criteria unverifiable.')}
 const evidence=[submission.content,submission.notes,...submission.urls.map((url:string)=>'URL reference (not fetched; unverified): '+url),...fileContext].filter(Boolean).join('\n\n');
 await db.submission.update({where:{id:submission.id},data:{status:'ASSESSMENT_PENDING'}});
 try{
  const assessment=await verifyEvidence({evidence,milestone:milestone.title,description:milestone.description,agreement:version.body,acceptanceCriteria:criteria});
  const saved=await db.assessment.create({data:{dealId:submission.dealId,submissionId:submission.id,milestoneId:milestone.id,agreementVersion:submission.agreementVersion,overallScore:assessment.overallScore,status:assessment.status,criteriaResults:JSON.stringify(assessment.criteriaResults),missingEvidence:JSON.stringify(assessment.missingEvidence),concerns:JSON.stringify(assessment.concerns),recommendation:assessment.recommendation,explanation:assessment.explanation}});
  await db.submission.update({where:{id:submission.id},data:{status:'ASSESSED',assessment:JSON.stringify(assessment)}});
  await audit(submission.dealId,'ASSESSMENT_GENERATED','Advisory AI assessment retried successfully.','TrustFlow AI',undefined,{type:'ASSESSMENT',id:saved.id});
  const participants=[submission.deal.buyerId,...(submission.deal.providerId?[submission.deal.providerId]:[])];
  await notifyUsers(participants,submission.dealId,'Assessment completed','A retried advisory AI assessment is ready for review.','ASSESSMENT');
  const recipients=await db.user.findMany({where:{id:{in:participants}}});
  for(const recipient of recipients)void sendWorkflowEmail({dealId:submission.dealId,to:recipient.email,type:'ASSESSMENT_RESULT',dealTitle:submission.deal.title,message:'An advisory assessment is ready for review.',key:'assessment-'+saved.id+'-'+recipient.id}).catch(()=>null);
  return NextResponse.json({status:'ASSESSED',assessment,assessmentId:saved.id});
 }catch(error){
  await db.submission.update({where:{id:submission.id},data:{status:'ASSESSMENT_FAILED'}});
  return NextResponse.json({error:error instanceof Error&&error.message==='AI_CONFIGURATION_REQUIRED'?'Groq is not configured. Set GROQ_API_KEY and retry.':'AI assessment failed. The submission remains saved and can be retried.'},{status:503});
 }
}
