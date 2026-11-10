import {NextResponse} from 'next/server';
import {z} from 'zod';
import {currentUser} from '@/lib/auth';
import {db} from '@/lib/db';
const querySchema=z.object({dealId:z.string().min(1).max(100).optional(),cursor:z.string().min(1).max(100).optional(),limit:z.coerce.number().int().min(1).max(100).default(30)});
export async function GET(req:Request){
 const user=await currentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const parsed=querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));if(!parsed.success)return NextResponse.json({error:'Invalid activity query.'},{status:400});
 const {dealId,cursor,limit}=parsed.data;const where={deal:{OR:[{buyerId:user.id},{providerId:user.id}],...(dealId?{id:dealId}:{})}};
 if(cursor){const anchor=await db.activity.findFirst({where:{id:cursor,...where},select:{id:true}});if(!anchor)return NextResponse.json({error:'Invalid activity cursor.'},{status:400});}
 const rows=await db.activity.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],take:limit+1,...(cursor?{skip:1,cursor:{id:cursor}}:{})});
 const hasMore=rows.length>limit,items=hasMore?rows.slice(0,limit):rows;return NextResponse.json({items,nextCursor:hasMore?items[items.length-1]?.id:null});
}