import {NextResponse} from 'next/server';
import {z} from 'zod';
import {currentUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {audit,notifyUsers} from '@/lib/events';
import {mutationError} from '@/lib/security';
import {indexDealText} from '@/lib/rag';
function criteriaFromBody(body:string){return body.split(/\r?\n/).map(line=>line.trim()).filter(line=>line.startsWith('• ')).map(line=>line.slice(2).trim()).filter(Boolean)}
const input=z.object({body:z.string().trim().min(40).max(20000)});
export async function PATCH(req:Request,{params}:{params:{id:string}}){
 const invalid=mutationError(req);if(invalid)return invalid;
 const user=await currentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 let raw:unknown;try{raw=await req.json()}catch{return NextResponse.json({error:'Invalid JSON.'},{status:400})}
 const value=input.safeParse(raw);if(!value.success)return NextResponse.json({error:'Agreement text must be 40–20,000 characters.'},{status:400});
 const deal=await db.deal.findFirst({where:{id:params.id,buyerId:user.id},include:{agreement:true}});
 if(!deal?.agreement)return NextResponse.json({error:'Deal or agreement not found.'},{status:404});
 const current=deal.agreement;
 await db.agreementVersion.upsert({where:{dealId_version:{dealId:deal.id,version:current.version}},create:{dealId:deal.id,agreementId:current.id,version:current.version,body:current.body,acceptanceCriteria:JSON.stringify(criteriaFromBody(current.body)),buyerApprovedAt:current.buyerApprovedAt,providerApprovedAt:current.providerApprovedAt},update:{}});
 const agreement=await db.agreement.update({where:{dealId:deal.id},data:{body:value.data.body,version:{increment:1},buyerApprovedAt:null,providerApprovedAt:null,buyerApproverId:null,providerApproverId:null}});
 await db.agreementVersion.create({data:{dealId:deal.id,agreementId:agreement.id,version:agreement.version,body:agreement.body,acceptanceCriteria:JSON.stringify(criteriaFromBody(agreement.body))}});
 await audit(deal.id,'AGREEMENT_VERSION_UPDATED',`Agreement updated to version ${agreement.version}; both parties must approve this version.`,user.name,user.id,{type:'AGREEMENT',id:agreement.id});
 if(deal.providerId)await notifyUsers([deal.providerId],deal.id,'Agreement approval required',`Agreement version ${agreement.version} needs your approval.`,'AGREEMENT');
 void indexDealText({dealId:deal.id,ownerId:user.id,participantIds:[deal.buyerId,...(deal.providerId?[deal.providerId]:[])],sourceType:'AGREEMENT_DRAFT',sourceId:`${agreement.id}-v${agreement.version}`,title:`${deal.title} agreement v${agreement.version}`,text:agreement.body,agreementVersion:agreement.version}).catch(()=>null);
 return NextResponse.json(agreement);
}
