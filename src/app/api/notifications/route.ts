import {NextResponse} from 'next/server';
import {z} from 'zod';
import {currentUser} from '@/lib/auth';
import {db} from '@/lib/db';
const query=z.object({cursor:z.string().min(1).max(100).optional(),unread:z.enum(['true','false']).optional(),limit:z.coerce.number().int().min(1).max(100).default(30)});
export async function GET(req:Request){
 const user=await currentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const parsed=query.safeParse(Object.fromEntries(new URL(req.url).searchParams));if(!parsed.success)return NextResponse.json({error:'Invalid notification query.'},{status:400});
 const {cursor,unread,limit}=parsed.data,where={userId:user.id,...(unread==='true'?{readAt:null}:{})};
 if(cursor){const anchor=await db.notification.findFirst({where:{id:cursor,...where},select:{id:true}});if(!anchor)return NextResponse.json({error:'Invalid notification cursor.'},{status:400});}
 const [rows,unreadCount]=await Promise.all([
  db.notification.findMany({where,include:{deal:{select:{title:true}}},orderBy:[{createdAt:'desc'},{id:'desc'}],take:limit+1,...(cursor?{skip:1,cursor:{id:cursor}}:{})}),
  db.notification.count({where:{userId:user.id,readAt:null}})
 ]);
 const hasMore=rows.length>limit,items=hasMore?rows.slice(0,limit):rows;
 return NextResponse.json({items,unreadCount,nextCursor:hasMore?items[items.length-1]?.id:null});
}