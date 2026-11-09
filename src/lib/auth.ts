import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'node:crypto';
import { db } from './db';
import {hashPassword,verifyPassword} from './password';
const COOKIE='trustflow_session'; const TTL=1000*60*60*24*14;
export {hashPassword,verifyPassword};
export async function createSession(userId:string){const token=randomBytes(32).toString('base64url');const tokenHash=createHash('sha256').update(token).digest('hex');const expiresAt=new Date(Date.now()+TTL);await db.session.create({data:{userId,tokenHash,expiresAt}});cookies().set(COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',expires:expiresAt});}
export async function currentUser(){const token=cookies().get(COOKIE)?.value;if(!token)return null;const tokenHash=createHash('sha256').update(token).digest('hex');const session=await db.session.findUnique({where:{tokenHash},include:{user:true}});if(!session||session.expiresAt.getTime()<Date.now()){if(session)await db.session.delete({where:{id:session.id}});return null;}return session.user;}
export async function destroySession(){const token=cookies().get(COOKIE)?.value;if(token){const tokenHash=createHash('sha256').update(token).digest('hex');await db.session.deleteMany({where:{tokenHash}});}cookies().delete(COOKIE);}
