'use client';

import {useMemo,useState} from 'react';
import {usePathname} from 'next/navigation';
import {Bot,MessageCircle,Send,X} from 'lucide-react';

export function FloatingAskAI(){
  const pathname=usePathname();
  const dealId=useMemo(()=>pathname?.match(/^\/deals\/([a-f0-9]{24})\/?$/i)?.[1]??null,[pathname]);
  const [open,setOpen]=useState(false),[question,setQuestion]=useState(''),[answer,setAnswer]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  if(!dealId)return null;
  async function ask(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();const prompt=question.trim();if(prompt.length<3||busy)return;
    setBusy(true);setError('');setAnswer('');
    try{
      const response=await fetch('/api/ai/ask',{method:'POST',headers:{'content-type':'application/json'},credentials:'include',body:JSON.stringify({dealId,question:prompt})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'The assistant could not answer.');
      setAnswer(data.answer||'No answer was returned.');setQuestion('');
    }catch(reason){setError(reason instanceof Error?reason.message:'Unable to reach TrustFlow AI.');}
    finally{setBusy(false);}
  }
  return <div style={{position:'fixed',right:22,bottom:22,zIndex:40,fontFamily:'Arial,sans-serif'}}>
    {open&&<section role="dialog" aria-label="Ask TrustFlow AI" style={{width:'min(360px,calc(100vw - 30px))',maxHeight:'min(520px,70vh)',overflow:'auto',marginBottom:12,border:'1px solid #EADFCB',borderRadius:18,background:'#FFFDF8',boxShadow:'0 18px 55px #1f293733',padding:18}}>
      <header style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:12}}>
        <div style={{display:'flex',alignItems:'center',gap:9}}><span style={{width:34,height:34,borderRadius:11,background:'#EEF2FF',color:'#2F5BEA',display:'grid',placeItems:'center'}}><Bot size={18}/></span><div><strong style={{fontSize:13,color:'#1F2937'}}>Ask TrustFlow AI</strong><div style={{fontSize:10,color:'#64748B'}}>Context-aware deal assistant</div></div></div>
        <button type="button" onClick={()=>setOpen(false)} aria-label="Close assistant" style={{border:0,background:'transparent',color:'#64748B',padding:5}}><X size={17}/></button>
      </header>
      <p style={{fontSize:11,lineHeight:1.6,color:'#64748B',margin:'0 0 12px'}}>Ask about this deal's approved agreement, milestones, or recorded evidence. AI suggestions do not change deal terms.</p>
      {answer&&<div aria-live="polite" style={{whiteSpace:'pre-wrap',fontSize:12,lineHeight:1.65,color:'#334155',background:'#F6F8FF',borderRadius:12,padding:12,marginBottom:12}}>{answer}</div>}
      {error&&<p role="alert" style={{fontSize:11,color:'#B42318'}}>{error}</p>}
      <form onSubmit={ask} style={{display:'flex',gap:7,alignItems:'end'}}>
        <textarea value={question} onChange={e=>setQuestion(e.target.value)} rows={2} maxLength={2000} placeholder="Ask about the agreement…" aria-label="Your question" style={{flex:1,minWidth:0,resize:'vertical',border:'1px solid #EADFCB',borderRadius:10,padding:10,fontSize:12,background:'#fff',color:'#1F2937'}}/>
        <button type="submit" disabled={busy||question.trim().length<3} aria-label="Send question" style={{height:39,width:40,border:0,borderRadius:10,background:'#2F5BEA',color:'#fff',display:'grid',placeItems:'center',opacity:busy||question.trim().length<3?.55:1}}><Send size={15}/></button>
      </form>
      {busy&&<p style={{fontSize:10,color:'#64748B',marginBottom:0}}>Checking deal context…</p>}
    </section>}
    <button type="button" onClick={()=>setOpen(v=>!v)} aria-expanded={open} aria-label={open?'Close Ask TrustFlow AI':'Open Ask TrustFlow AI'} style={{marginLeft:'auto',height:54,minWidth:54,padding:'0 17px',border:0,borderRadius:999,background:'#2F5BEA',color:'#fff',boxShadow:'0 9px 26px #2f5bea55',display:'flex',alignItems:'center',justifyContent:'center',gap:9}}>
      {open?<X size={19}/>:<MessageCircle size={19}/>}<span style={{fontSize:12,fontWeight:700}}>Ask AI</span>
    </button>
  </div>;
}
