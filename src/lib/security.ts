import {NextResponse} from 'next/server';
const buckets=new Map<string,{count:number;resetAt:number}>();
export function mutationAllowed(req:Request){const origin=req.headers.get('origin');const allowed=process.env.NEXT_PUBLIC_APP_URL;if(!origin||!allowed)return true;return origin===new URL(allowed).origin}
export function mutationError(req:Request){return mutationAllowed(req)?null:NextResponse.json({error:'Invalid request origin.'},{status:403})}
export function rateLimit(key:string,limit=30,windowMs=60_000){const now=Date.now(),entry=buckets.get(key);if(!entry||entry.resetAt<=now){buckets.set(key,{count:1,resetAt:now+windowMs});return true}if(entry.count>=limit)return false;entry.count++;return true}
export function retryDelay(attempts:number){return Math.min(60*60_000,60_000*2**Math.max(0,attempts-1))}
