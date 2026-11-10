import {NextResponse} from 'next/server';
import {currentUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {mutationError} from '@/lib/security';
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;
 const invalid=mutationError(req);if(invalid)return invalid;
 const user=await currentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const result=await db.notification.updateMany({where:{id:id,userId:user.id,readAt:null},data:{readAt:new Date()}});
 if(result.count)return NextResponse.json({ok:true});
 const existing=await db.notification.findFirst({where:{id:id,userId:user.id},select:{id:true}});
 return existing?NextResponse.json({ok:true,alreadyRead:true}):NextResponse.json({error:'Notification not found.'},{status:404});
}