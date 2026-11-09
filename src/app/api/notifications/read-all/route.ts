import {NextResponse} from 'next/server';import {currentUser} from '@/lib/auth';import {db} from '@/lib/db';
export async function POST(){const u=await currentUser();if(!u)return NextResponse.json({error:'Unauthorized'},{status:401});const result=await db.notification.updateMany({where:{userId:u.id,readAt:null},data:{readAt:new Date()}});return NextResponse.json({updated:result.count});}
