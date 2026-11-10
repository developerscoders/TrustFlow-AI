import {NextResponse} from 'next/server';
import {z} from 'zod';
import {currentUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {audit,notifyUsers} from '@/lib/events';
import {sendWorkflowEmail} from '@/lib/mailer';
import {mutationError,rateLimit} from '@/lib/security';
const input=z.object({reason:z.string().trim().min(10).max(4000)});
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;
 const invalid=mutationError(req);if(invalid)return invalid;
 const user=await currentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 if(!rateLimit('dispute:'+user.id,10))return NextResponse.json({error:'Too many dispute requests.'},{status:429});
 let raw:unknown;try{raw=await req.json()}catch{return NextResponse.json({error:'Invalid JSON.'},{status:400})}
 const value=input.safeParse(raw);if(!value.success)return NextResponse.json({error:'Provide a dispute reason.'},{status:400});
 const deal=await db.deal.findFirst({where:{id:id,OR:[{buyerId:user.id},{providerId:user.id}]}});
 if(!deal)return NextResponse.json({error:'Deal not found.'},{status:404});
 const dispute=await db.dispute.create({data:{dealId:deal.id,openedById:user.id,reason:value.data.reason}});
 await db.deal.update({where:{id:deal.id},data:{status:'DISPUTED'}});
 await audit(deal.id,'DISPUTE_OPENED','A dispute was opened.',user.name,user.id,{type:'DISPUTE',id:dispute.id});
 const other=user.id===deal.buyerId?deal.providerId:deal.buyerId;
 if(other){
  await notifyUsers([other],deal.id,'Dispute opened',user.name+' opened a dispute for '+deal.title+'.','DISPUTE');
  const recipient=await db.user.findUnique({where:{id:other}});
  if(recipient)void sendWorkflowEmail({dealId:deal.id,to:recipient.email,type:'DISPUTE_OPENED',dealTitle:deal.title,message:user.name+' opened a dispute.',key:'dispute-'+dispute.id+'-'+recipient.id}).catch(()=>null);
 }
 return NextResponse.json(dispute,{status:201});
}