import {NextResponse} from 'next/server';import {z} from 'zod';import {db} from '@/lib/db';import {currentUser} from '@/lib/auth';import {dealInput} from '@/lib/schemas';import {analyzeDeal} from '@/lib/ai';import {notifyUsers} from '@/lib/events';import {sendWorkflowEmail} from '@/lib/mailer';import {indexDealText} from '@/lib/rag';import {mutationError,rateLimit} from '@/lib/security';

const createDealInput=dealInput.omit({buyerName:true,providerName:true}).extend({providerEmail:z.string().trim().email().max(254)});

export async function GET(){
  const user=await currentUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  return NextResponse.json(await db.deal.findMany({where:{OR:[{buyerId:user.id},{providerId:user.id}]},include:{milestones:true,agreement:true},orderBy:{updatedAt:'desc'}}));
}

export async function POST(req:Request){
  const invalid=mutationError(req);
  if(invalid)return invalid;
  const user=await currentUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!rateLimit(`deal:${user.id}`,20))return NextResponse.json({error:'Too many deal requests.'},{status:429});
  try{
    const value=createDealInput.safeParse(await req.json());
    if(!value.success)return NextResponse.json({error:'Invalid deal details. Include a valid provider account email.'},{status:400});
    const provider=await db.user.findUnique({where:{email:value.data.providerEmail.toLowerCase()}});
    if(!provider)return NextResponse.json({error:'No TrustFlow account exists for that provider email. Ask the provider to register first.'},{status:404});
    if(provider.id===user.id)return NextResponse.json({error:'You cannot invite your own account as the provider.'},{status:400});
    const analysis=await analyzeDeal(value.data.description,value.data.amount);
    if(analysis.milestones.reduce((sum,m)=>sum+m.amount,0)!==value.data.amount)return NextResponse.json({error:'AI milestone totals did not match.'},{status:422});
    const agreementBody=[analysis.summary,'',...analysis.acceptanceCriteria.map(x=>'• '+x),'',...analysis.milestones.map(m=>`${m.title}: $${(m.amount/100).toFixed(2)} — ${m.description}`)].join('\\n');
    const deal=await db.deal.create({data:{
      title:value.data.title,description:value.data.description,amount:value.data.amount,currency:'USD',
      buyerName:user.name,providerName:provider.name,buyerId:user.id,providerId:provider.id,
      analysis:JSON.stringify(analysis),dueDate:value.data.dueDate?new Date(value.data.dueDate):undefined,
      milestones:{create:analysis.milestones.map((m,position)=>({...m,position}))},
      agreement:{create:{body:agreementBody}},
      activities:{create:[{type:'DEAL_CREATED',message:'Deal created.',actor:user.name,actorId:user.id},{type:'AI_ANALYSIS_COMPLETED',message:'AI deal analysis completed.',actor:'TrustFlow AI'},{type:'AGREEMENT_GENERATED',message:'Agreement version 1 generated.',actor:'TrustFlow AI'}]}
    },include:{milestones:true,agreement:true}});
    await db.agreementVersion.create({data:{dealId:deal.id,agreementId:deal.agreement!.id,version:1,body:agreementBody,acceptanceCriteria:JSON.stringify(analysis.acceptanceCriteria)}});
    await notifyUsers([provider.id],deal.id,'Deal invitation',`${user.name} invited you to ${deal.title}.`,'INVITATION');
    void sendWorkflowEmail({dealId:deal.id,to:provider.email,type:'DEAL_INVITATION',dealTitle:deal.title,message:`${user.name} invited you to review this deal.`,key:`invite-${deal.id}-${provider.id}`});
    void indexDealText({dealId:deal.id,ownerId:user.id,participantIds:[user.id,provider.id],sourceType:'AGREEMENT',sourceId:deal.agreement!.id,title:`${deal.title} agreement`,text:agreementBody,agreementVersion:1}).catch(()=>null);
    return NextResponse.json(deal,{status:201});
  }catch{return NextResponse.json({error:'Could not create deal.'},{status:500});}
}
