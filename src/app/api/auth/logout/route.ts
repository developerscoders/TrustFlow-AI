import {NextResponse} from 'next/server';
import {destroySession} from '@/lib/auth';
import {mutationError} from '@/lib/security';

export async function POST(req:Request){
  const invalid=mutationError(req);
  if(invalid)return invalid;
  try{
    await destroySession();
    return NextResponse.json({ok:true});
  }catch{
    return NextResponse.json({error:'Could not end the session. Please try again.'},{status:503});
  }
}
