import {NextResponse} from 'next/server';
import {currentUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {readEvidenceFile} from '@/lib/private-storage';
export async function GET(_:Request,{params}:{params:Promise<{id:string;fileId:string}>}){const {id,fileId}=await params;
 const user=await currentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const submission=await db.submission.findUnique({where:{id:id},include:{deal:true}});
 if(!submission||![submission.deal.buyerId,submission.deal.providerId].includes(user.id))return NextResponse.json({error:'File not found.'},{status:404});
 const files=JSON.parse(submission.fileMetadata||'[]') as any[];
 const file=files.find(item=>item.id===fileId);if(!file)return NextResponse.json({error:'File not found.'},{status:404});
 try{const bytes=await readEvidenceFile(file.storageKey);return new Response(new Uint8Array(bytes),{headers:{'Content-Type':file.contentType,'Content-Length':String(bytes.length),'Content-Disposition':'attachment; filename="'+String(file.filename).replace(/["\\r\\n]/g,'_')+'"','X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}})}catch{return NextResponse.json({error:'Private file is unavailable.'},{status:404})}
}
