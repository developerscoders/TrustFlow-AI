import {NextResponse} from 'next/server';
import {currentUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {mutationError} from '@/lib/security';
export async function POST(req:Request){
 const invalid=mutationError(req);if(invalid)return invalid;
 const user=await currentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const result=await db.notification.updateMany({where:{userId:user.id,readAt:null},data:{readAt:new Date()}});
 return NextResponse.json({updated:result.count});
}