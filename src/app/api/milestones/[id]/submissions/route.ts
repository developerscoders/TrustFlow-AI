import {NextResponse} from 'next/server';
import {z} from 'zod';
import {currentUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {audit,notifyUsers} from '@/lib/events';
import {sendWorkflowEmail} from '@/lib/mailer';
import {verifyEvidence} from '@/lib/ai';
import {indexDealText} from '@/lib/rag';
import {mutationError,rateLimit} from '@/lib/security';
import {readEvidenceFile,storeEvidenceFile,validateEvidenceUrl} from '@/lib/private-storage';
import {canSubmitEvidence} from '@/lib/workflow-authorization';
const fileInput=z.object({name:z.string().min(1).max(200),type:z.string().max(100),base64:z.string().max(6000000)});
const input=z.object({content:z.string().max(12000).default(''),notes:z.string().max(3000).optional(),urls:z.array(z.string().url().max(2048)).max(10).default([]),files:z.array(fileInput).max(3).default([]),revisionOfId:z.string().optional()}).refine(v=>v.content.trim().length>=10||v.urls.length>0||v.files.length>0,{message:'Provide a written description, URL, or file.'});
async function assessSubmission(submissionId:string,milestoneId:string){
 const submission=await db.submission.findUnique({where:{id:submissionId},include:{deal:true}});
 const previous=await db.assessment.findUnique({where:{submissionId}});if(previous){const restored={overallScore:previous.overallScore,status:previous.status,criteriaResults:JSON.parse(previous.criteriaResults),missingEvidence:JSON.parse(previous.missingEvidence),concerns:JSON.parse(previous.concerns),recommendation:previous.recommendation,explanation:previous.explanation};await db.submission.update({where:{id:submissionId},data:{assessment:JSON.stringify(restored),status:'ASSESSED'}});return {assessment:restored,saved:previous}}
 if(!submission)throw new Error('SUBMISSION_NOT_FOUND');
 const milestone=await db.milestone.findUnique({where:{id:milestoneId}});
 if(!milestone)throw new Error('MILESTONE_NOT_FOUND');
 const version=await db.agreementVersion.findUnique({where:{dealId_version:{dealId:submission.dealId,version:submission.agreementVersion}}});
 if(!version?.buyerApprovedAt||!version.providerApprovedAt)throw new Error('APPROVED_AGREEMENT_VERSION_NOT_FOUND');
 let criteria:string[]=[];try{const parsed=JSON.parse(version.acceptanceCriteria||'[]');if(Array.isArray(parsed))criteria=parsed.filter((x:unknown)=>typeof x==='string')}catch{}if(!criteria.length)throw new Error('APPROVED_ACCEPTANCE_CRITERIA_NOT_FOUND');
 const metadata=JSON.parse(submission.fileMetadata||'[]') as {filename:string;contentType:string;size:number;storageKey:string}[];
 const fileContext:string[]=[];
 for(const file of metadata){if(file.contentType==='text/plain'){try{const bytes=await readEvidenceFile(file.storageKey);fileContext.push('Text file '+file.filename+': '+bytes.toString('utf8').slice(0,8000))}catch{fileContext.push('File '+file.filename+' could not be read and is unverifiable.')}}else fileContext.push('File '+file.filename+' ('+file.contentType+', '+file.size+' bytes) is attached but its contents have not been extracted; mark relevant criteria unverifiable.')}
 const evidence=[submission.content,submission.notes?'Submission notes: '+submission.notes:'',...submission.urls.map((url:string)=>'URL reference (not fetched; unverified): '+url),...fileContext].filter(Boolean).join('\n\n');
 const assessment=await verifyEvidence({evidence,milestone:milestone.title,description:milestone.description,agreement:version.body,acceptanceCriteria:criteria});
 const saved=await db.assessment.create({data:{dealId:submission.dealId,submissionId:submission.id,milestoneId,agreementVersion:submission.agreementVersion,overallScore:assessment.overallScore,status:assessment.status,criteriaResults:JSON.stringify(assessment.criteriaResults),missingEvidence:JSON.stringify(assessment.missingEvidence),concerns:JSON.stringify(assessment.concerns),recommendation:assessment.recommendation,explanation:assessment.explanation}});
 await db.submission.update({where:{id:submission.id},data:{assessment:JSON.stringify(assessment),status:'ASSESSED'}});
 await audit(submission.dealId,'ASSESSMENT_GENERATED','Advisory AI assessment completed for '+milestone.title+' (score '+assessment.overallScore+'/100).','TrustFlow AI',undefined,{type:'ASSESSMENT',id:saved.id});
 const participants=[submission.deal.buyerId,...(submission.deal.providerId?[submission.deal.providerId]:[])];
 await notifyUsers(participants,submission.dealId,'Assessment completed','An advisory AI assessment is ready for '+milestone.title+'. Participant review is required.','ASSESSMENT');
 const recipients=await db.user.findMany({where:{id:{in:participants}}});
 for(const recipient of recipients)void sendWorkflowEmail({dealId:submission.dealId,to:recipient.email,type:'ASSESSMENT_RESULT',dealTitle:submission.deal.title,message:'An advisory assessment is ready for milestone: '+milestone.title+'. Review it with the other participant.',key:'assessment-'+saved.id+'-'+recipient.id}).catch(()=>null);
 return {assessment,saved};
}
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;
 const user=await currentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const milestone=await db.milestone.findUnique({where:{id:id},include:{deal:true}});
 if(!milestone||![milestone.deal.buyerId,milestone.deal.providerId].includes(user.id))return NextResponse.json({error:'Not found.'},{status:404});
 const submissions=await db.submission.findMany({where:{milestoneId:id},orderBy:{createdAt:'desc'}});
 return NextResponse.json(submissions.map(s=>({...s,fileMetadata:(JSON.parse(s.fileMetadata||'[]') as any[]).map(f=>({id:f.id,filename:f.filename,contentType:f.contentType,size:f.size,url:'/api/submissions/'+s.id+'/files/'+f.id}))})));
}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;
 const invalid=mutationError(req);if(invalid)return invalid;
 const user=await currentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 if(!rateLimit('submission:'+user.id,12))return NextResponse.json({error:'Too many submissions. Try again later.'},{status:429});
 let raw:unknown;try{raw=await req.json()}catch{return NextResponse.json({error:'Invalid JSON.'},{status:400})}
 const value=input.safeParse(raw);if(!value.success)return NextResponse.json({error:value.error.issues[0]?.message||'Invalid evidence submission.'},{status:400});
 if(value.data.urls.some(url=>!validateEvidenceUrl(url)))return NextResponse.json({error:'Only public HTTP or HTTPS evidence URLs are accepted. Local/private network addresses are blocked.'},{status:400});
 const milestone=await db.milestone.findUnique({where:{id:id},include:{deal:{include:{agreement:true}}}});
 if(!milestone)return NextResponse.json({error:'Milestone not found.'},{status:404});
 const agreement=milestone.deal.agreement;
 if(!agreement)return NextResponse.json({error:'An agreement must exist before evidence can be submitted.'},{status:409});
 if(!canSubmitEvidence(user.id,milestone.deal.providerId,agreement?.buyerApprovedAt,agreement?.providerApprovedAt))return NextResponse.json({error:'Only the provider may submit evidence after both parties approve the agreement.'},{status:403});
 const approvedVersion=await db.agreementVersion.findUnique({where:{dealId_version:{dealId:milestone.dealId,version:agreement.version}}});
 if(!approvedVersion?.buyerApprovedAt||!approvedVersion.providerApprovedAt)return NextResponse.json({error:'The current approved agreement version could not be confirmed.'},{status:409});
 if(value.data.revisionOfId){const original=await db.submission.findFirst({where:{id:value.data.revisionOfId,milestoneId:milestone.id,dealId:milestone.dealId,submittedById:user.id}});if(!original)return NextResponse.json({error:'Original provider submission not found.'},{status:404});}
 const storedFiles:any[]=[];
 try{for(const file of value.data.files)storedFiles.push(await storeEvidenceFile(file))}
 catch(error){return NextResponse.json({error:error instanceof Error&&error.message==='PRIVATE_STORAGE_CONFIGURATION_REQUIRED'?'Private file storage is not configured on this deployment. Submit text or links, or configure TRUSTFLOW_PRIVATE_UPLOAD_DIR.':error instanceof Error?error.message:'File storage failed.'},{status:503})}
 try{
  const submission=await db.submission.create({data:{dealId:milestone.dealId,milestoneId:milestone.id,submittedById:user.id,content:value.data.content,notes:value.data.notes,urls:value.data.urls,fileMetadata:JSON.stringify(storedFiles),revisionOfId:value.data.revisionOfId,agreementVersion:agreement.version,status:'ASSESSMENT_PENDING'}});
  await db.milestone.update({where:{id:milestone.id},data:{status:'SUBMITTED'}});
  const deal=milestone.deal;
  await audit(deal.id,value.data.revisionOfId?'REVISION_SUBMITTED':'EVIDENCE_SUBMITTED',(value.data.revisionOfId?'Revision':'Evidence')+' submitted for '+milestone.title+'.',user.name,user.id,{type:'SUBMISSION',id:submission.id});
  await notifyUsers([deal.buyerId],deal.id,value.data.revisionOfId?'Revision submitted':'Evidence submitted',user.name+' submitted evidence for '+milestone.title+'.','EVIDENCE');
  const buyer=await db.user.findUnique({where:{id:deal.buyerId}});
  if(buyer)void sendWorkflowEmail({dealId:deal.id,to:buyer.email,type:'EVIDENCE_SUBMITTED',dealTitle:deal.title,message:user.name+' submitted evidence for '+milestone.title+'.',key:'submission-'+submission.id+'-'+buyer.id}).catch(()=>null);
  void indexDealText({dealId:deal.id,ownerId:user.id,participantIds:[deal.buyerId,...(deal.providerId?[deal.providerId]:[])],sourceType:'SUBMISSION',sourceId:submission.id,title:milestone.title,text:[submission.content,submission.notes,...submission.urls].filter(Boolean).join('\n'),agreementVersion:agreement.version}).catch(()=>null);
  try{const result=await assessSubmission(submission.id,milestone.id);return NextResponse.json({...submission,assessment:JSON.stringify(result.assessment),assessmentState:'COMPLETED',assessmentId:result.saved.id},{status:201})}
  catch(error){await db.submission.update({where:{id:submission.id},data:{status:'ASSESSMENT_FAILED'}});const configured=error instanceof Error&&error.message==='AI_CONFIGURATION_REQUIRED';return NextResponse.json({...submission,assessment:null,assessmentState:configured?'CONFIGURATION_REQUIRED':'FAILED',assessmentMessage:configured?'Groq is not configured. Your evidence is saved; configure GROQ_API_KEY and retry assessment.':'Evidence is saved, but AI assessment failed. Retry it when the AI service is available.'},{status:201})}
 }catch{return NextResponse.json({error:'Evidence submission could not be saved.'},{status:500})}
}
