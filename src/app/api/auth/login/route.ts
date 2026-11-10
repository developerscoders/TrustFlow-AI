import {NextResponse} from 'next/server';
import {z} from 'zod';
import {db} from '@/lib/db';
import {createSession,verifyPassword} from '@/lib/auth';
import {mutationError,rateLimit} from '@/lib/security';

const input=z.object({email:z.string().trim().email().max(254),password:z.string().min(1).max(128)});

export async function POST(req:Request){
  const invalid=mutationError(req);
  if(invalid)return invalid;
  let raw:unknown;
  try{raw=await req.json()}catch{return NextResponse.json({error:'Invalid request body.'},{status:400})}
  const parsed=input.safeParse(raw);
  if(!parsed.success)return NextResponse.json({error:'Enter a valid email and password.'},{status:400});
  const email=parsed.data.email.toLowerCase();
  if(!rateLimit('auth:login:'+email,8,15*60_000))return NextResponse.json({error:'Too many login attempts. Try again in 15 minutes.'},{status:429});
  try{
    const user=await db.user.findUnique({where:{email}});
    if(!user||!await verifyPassword(parsed.data.password,user.passwordHash))return NextResponse.json({error:'Email or password is incorrect.'},{status:401});
    await createSession(user.id);
    return NextResponse.json({id:user.id,name:user.name,email:user.email});
  }catch{
    return NextResponse.json({error:'Login is temporarily unavailable. Please try again.'},{status:503});
  }
}
