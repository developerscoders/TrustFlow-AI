import {NextResponse} from 'next/server';
import {z} from 'zod';
import {currentUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {mutationError,rateLimit} from '@/lib/security';

const input=z.object({message:z.string().trim().min(2).max(2000)});

export async function GET(_:Request,{params}:{params:{id:string}}){
  const user=await currentUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const deal=await db.deal.findFirst({where:{id:params.id,OR:[{buyerId:user.id},{providerId:user.id}]}});
  if(!deal)return NextResponse.json({error:'Deal not found.'},{status:404});
  const messages=await db.activity.findMany({where:{dealId:deal.id,type:'NEGOTIATION_MESSAGE'},orderBy:{createdAt:'asc'},take:100});
  return NextResponse.json({messages:messages.map(m=>({id:m.id,message:m.message,actor:m.actor,actorId:m.actorId,createdAt:m.createdAt,isMine:m.actorId===user.id}))});
}

export async function POST(req:Request,{params}:{params:{id:string}}){
  const invalid=mutationError(req);if(invalid)return invalid;
  const user=await currentUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!rateLimit('negotiation:'+user.id,30))return NextResponse.json({error:'You are sending messages too quickly.'},{status:429});
  let raw:unknown;try{raw=await req.json()}catch{return NextResponse.json({error:'Invalid JSON.'},{status:400})}
  const parsed=input.safeParse(raw);
  if(!parsed.success)return NextResponse.json({error:'Message must be between 2 and 2,000 characters.'},{status:400});
  const deal=await db.deal.findFirst({where:{id:params.id,OR:[{buyerId:user.id},{providerId:user.id}]}});
  if(!deal)return NextResponse.json({error:'Deal not found.'},{status:404});
  const entry=await db.activity.create({data:{dealId:deal.id,type:'NEGOTIATION_MESSAGE',message:parsed.data.message,actor:user.name,actorId:user.id,entityType:'NEGOTIATION'}});
  const other=deal.buyerId===user.id?deal.providerId:deal.buyerId;
  if(other){
    const {notifyUsers}=await import('@/lib/events');
    await notifyUsers([other],deal.id,'New deal message',user.name+' sent a message about '+deal.title+'.','NEGOTIATION');
  }
  return NextResponse.json({id:entry.id,message:entry.message,actor:entry.actor,actorId:entry.actorId,createdAt:entry.createdAt,isMine:true},{status:201});
}
