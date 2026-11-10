import {NextResponse} from 'next/server';
import OpenAI from 'openai';
import {currentUser} from '@/lib/auth';
import {db} from '@/lib/db';

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;
  const user=await currentUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  try{
    const deal=await db.deal.findFirst({
      where:{id:id,OR:[{buyerId:user.id},{providerId:user.id}]},
      include:{
        agreement:true,
        milestones:{orderBy:{position:'asc'}},
        disputes:{orderBy:{createdAt:'asc'}},
        submissions:{orderBy:{createdAt:'asc'},include:{assessmentRecord:true}}
      }
    });
    if(!deal)return NextResponse.json({error:'Deal not found.'},{status:404});
    const agreementBody=deal.agreement?.body||'';
    const formatAmount=(minorUnits:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:deal.currency}).format(minorUnits/100);
    const milestoneTotal=deal.milestones.reduce((sum,milestone)=>sum+milestone.amount,0);
    const facts={
      deal:{title:deal.title,status:deal.status,recordedAmount:formatAmount(deal.amount),currency:deal.currency,description:deal.description},
      agreement:deal.agreement?{version:deal.agreement.version,buyerApproved:!!deal.agreement.buyerApprovedAt,providerApproved:!!deal.agreement.providerApprovedAt,body:agreementBody}:null,
      milestones:deal.milestones.map(m=>({title:m.title,status:m.status,recordedAmount:formatAmount(m.amount),description:m.description})),
      milestoneTotal:formatAmount(milestoneTotal),
      disputes:deal.disputes.map(d=>({reason:d.reason,status:d.status,openedAt:d.createdAt})),
      submissions:deal.submissions.map(s=>({content:s.content,status:s.status,createdAt:s.createdAt,assessment:s.assessmentRecord?{score:s.assessmentRecord.overallScore,status:s.assessmentRecord.status,explanation:s.assessmentRecord.explanation,concerns:s.assessmentRecord.concerns,missingEvidence:s.assessmentRecord.missingEvidence}:null}))
    };
    const verifiedSections=[
      '## Recorded amounts',
      `- Deal record: ${facts.deal.recordedAmount} ${deal.currency}.`,
      `- Milestone total: ${facts.milestoneTotal} ${deal.currency}.`,
      ...facts.milestones.map(milestone=>`- ${milestone.title}: ${milestone.recordedAmount} ${deal.currency} (${milestone.status}).`),
    ];
    if(!process.env.GROQ_API_KEY)return NextResponse.json({configured:false,summary:`${verifiedSections.join('\n')}\n\nAI summary is not configured.`,facts,message:'AI summary is not configured; database-recorded amounts are shown below.'});
    const ai=new OpenAI({apiKey:process.env.GROQ_API_KEY,baseURL:'https://api.groq.com/openai/v1'});
    const result=await ai.chat.completions.create({
      model:process.env.GROQ_MODEL||'llama-3.3-70b-versatile',
      temperature:0.1,
      messages:[
        {role:'system',content:'Write a concise neutral dispute brief in plain readable text with Markdown headings and bullets. Do not return JSON or code fences. Use only supplied database facts. The deal recordedAmount and each milestone recordedAmount are already formatted authoritative database values: reproduce them exactly and never calculate or alter them. The agreement body is unverified source prose and may conflict with the deal record; report any discrepancy as text without treating prose values as authoritative. Do not invent performance requirements, dates, payments, evidence, disputes, or statuses. Do not decide who is right or give legal advice. Include sections: Overview, Recorded terms, Milestones, Evidence and dispute history, Unresolved questions, Suggested next steps. Every statement must be grounded in supplied facts. If information is missing, say so.'},
        {role:'user',content:JSON.stringify(facts)}
      ]
    });
    const raw=result.choices[0]?.message.content||'';
    let narrative=raw.trim();
    try{
      const parsed=JSON.parse(raw);
      if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))narrative=[
        typeof parsed.overview==='string'?`## Overview\n${parsed.overview}`:'',
        typeof parsed.agreedTerms==='string'?`## Recorded terms\n${parsed.agreedTerms}`:'',
        typeof parsed.timeline==='string'?`## Milestones and timeline\n${parsed.timeline}`:'',
        typeof parsed.evidence==='string'?`## Evidence and dispute history\n${parsed.evidence}`:'',
        Array.isArray(parsed.unresolvedQuestions)?`## Unresolved questions\n${parsed.unresolvedQuestions.map((item:string)=>`- ${item}`).join('\n')}`:'',
        Array.isArray(parsed.suggestedNextSteps)?`## Suggested next steps\n${parsed.suggestedNextSteps.map((item:string)=>`- ${item}`).join('\n')}`:''
      ].filter(Boolean).join('\n\n');
    }catch{}
    // Amounts are deterministic database facts. Strip any model-produced numeric claims
    // and append the verified figures so model output cannot alter contract values.
    const withoutAmountClaims=narrative
      .replace(/\$\s?\d[\d,]*(?:\.\d{1,2})?/g,'[amount omitted; see recorded amounts]')
      .replace(/\b\d[\d,]*(?:\.\d{1,2})?\s*(?:USD|EUR|GBP|INR)\b/gi,'[amount omitted; see recorded amounts]');
    const summary=`${withoutAmountClaims}\n\n${verifiedSections.join('\n')}`.trim();
    return NextResponse.json({configured:true,summary,facts});
  }catch{
    return NextResponse.json({error:'Could not prepare the dispute summary.'},{status:503});
  }
}
