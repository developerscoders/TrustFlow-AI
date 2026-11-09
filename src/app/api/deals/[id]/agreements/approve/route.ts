import {NextResponse} from 'next/server';
import {currentUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {audit,notifyUsers} from '@/lib/events';
import {sendWorkflowEmail} from '@/lib/mailer';
import {indexDealText} from '@/lib/rag';
export async function POST(_:Request,{params}:{params:{id:string}}){
 const user=await currentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const deal=await db.deal.findFirst({where:{id:params.id,OR:[{buyerId:user.id},{providerId:user.id}]},include:{agreement:true}});
 if(!deal?.agreement)return NextResponse.json({error:'Deal or agreement not found.'},{status:404});
 const buyer=deal.buyerId===user.id,now=new Date(),agreement=deal.agreement;const criteria=agreement.body.split(/\r?\n/).map(line=>line.trim()).filter(line=>line.startsWith('• ')).map(line=>line.slice(2).trim()).filter(Boolean);
 const data=buyer?{buyerApprovedAt:now,buyerApproverId:user.id}:{providerApprovedAt:now,providerApproverId:user.id};
 const updated=await db.agreement.updateMany({where:{id:agreement.id,version:agreement.version},data});
 if(!updated.count)return NextResponse.json({error:'Agreement changed; reload and approve the latest version.'},{status:409});
 const current=await db.agreement.findUniqueOrThrow({where:{id:agreement.id}});
 await db.agreementVersion.upsert({where:{dealId_version:{dealId:deal.id,version:current.version}},create:{dealId:deal.id,agreementId:current.id,version:current.version,body:current.body,acceptanceCriteria:JSON.stringify(criteria),buyerApprovedAt:current.buyerApprovedAt,providerApprovedAt:current.providerApprovedAt},update:{body:current.body,acceptanceCriteria:JSON.stringify(criteria),buyerApprovedAt:current.buyerApprovedAt,providerApprovedAt:current.providerApprovedAt}});
 if(current.buyerApprovedAt&&current.providerApprovedAt){
  await db.deal.update({where:{id:deal.id},data:{status:'ACTIVE'}});
  const participants=[deal.buyerId,...(deal.providerId?[deal.providerId]:[])];
  const recipients=await db.user.findMany({where:{id:{in:participants}}});
  for(const recipient of recipients)void sendWorkflowEmail({dealId:deal.id,to:recipient.email,type:'AGREEMENT_APPROVED',dealTitle:deal.title,message:`Both parties approved agreement version ${current.version}.`,key:`agreement-approved-${deal.id}-${current.version}-${recipient.id}`});
  void indexDealText({dealId:deal.id,ownerId:deal.buyerId,participantIds:participants,sourceType:'APPROVED_AGREEMENT',sourceId:`${current.id}-v${current.version}`,title:`${deal.title} approved agreement v${current.version}`,text:current.body,agreementVersion:current.version}).catch(()=>null);
 }
 await audit(deal.id,'AGREEMENT_APPROVED',`${buyer?'Buyer':'Provider'} approved version ${current.version}.`,user.name,user.id);
 const other=buyer?deal.providerId:deal.buyerId;if(other)await notifyUsers([other],deal.id,'Agreement approved',`${user.name} approved agreement version ${current.version}.`,'AGREEMENT');
 return NextResponse.json(current);
}
