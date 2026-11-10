import {NextResponse} from 'next/server';
import OpenAI from 'openai';
import {currentUser} from '@/lib/auth';
import {db} from '@/lib/db';

export async function GET(_:Request,{params}:{params:{id:string}}){
  const user=await currentUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  try{
    const deal=await db.deal.findFirst({
      where:{id:params.id,OR:[{buyerId:user.id},{providerId:user.id}]},
      include:{
        agreement:true,
        milestones:{orderBy:{position:'asc'}},
        disputes:{orderBy:{createdAt:'asc'}},
        submissions:{orderBy:{createdAt:'asc'},include:{assessmentRecord:true}}
      }
    });
    if(!deal)return NextResponse.json({error:'Deal not found.'},{status:404});
    const facts={
      deal:{title:deal.title,status:deal.status,description:deal.description},
      agreement:deal.agreement?{version:deal.agreement.version,body:deal.agreement.body,buyerApproved:!!deal.agreement.buyerApprovedAt,providerApproved:!!deal.agreement.providerApprovedAt}:null,
      milestones:deal.milestones.map(m=>({title:m.title,status:m.status,description:m.description})),
      disputes:deal.disputes.map(d=>({reason:d.reason,status:d.status,openedAt:d.createdAt})),
      submissions:deal.submissions.map(s=>({content:s.content,status:s.status,createdAt:s.createdAt,assessment:s.assessmentRecord?{score:s.assessmentRecord.overallScore,status:s.assessmentRecord.status,explanation:s.assessmentRecord.explanation,concerns:s.assessmentRecord.concerns,missingEvidence:s.assessmentRecord.missingEvidence}:null}))
    };
    if(!process.env.GROQ_API_KEY)return NextResponse.json({configured:false,summary:null,facts,message:'Add GROQ_API_KEY to generate an AI dispute summary. The recorded facts are available below.'});
    const ai=new OpenAI({apiKey:process.env.GROQ_API_KEY,baseURL:'https://api.groq.com/openai/v1'});
    const result=await ai.chat.completions.create({
      model:process.env.GROQ_MODEL||'llama-3.3-70b-versatile',
      temperature:0.1,
      messages:[
        {role:'system',content:'You are a neutral dispute case summarizer. Use only the supplied deal records. Do not decide who is right, invent facts, give legal advice, or imply that AI can adjudicate. Return concise JSON with keys: overview, agreedTerms, timeline, evidence, unresolvedQuestions, suggestedNextSteps. Every statement must be grounded in the supplied records. If information is missing, say so.'},
        {role:'user',content:JSON.stringify(facts)}
      ]
    });
    const raw=result.choices[0]?.message.content||'';
    return NextResponse.json({configured:true,summary:raw,facts});
  }catch{
    return NextResponse.json({error:'Could not prepare the dispute summary.'},{status:503});
  }
}
