'use client';

import {useCallback,useEffect,useState} from 'react';
import {MessageCircle,Send} from 'lucide-react';

type Message={id:string;message:string;actor:string;actorId:string|null;createdAt:string;isMine:boolean};

export function NegotiationPanel({dealId}:{dealId:string}){
  const [messages,setMessages]=useState<Message[]>([]),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const load=useCallback(async()=>{
    try{
      const r=await fetch('/api/deals/'+dealId+'/negotiation',{credentials:'include',cache:'no-store'});
      const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not load messages.');
      setMessages(d.messages||[]);setError('');
    }catch(e){setError(e instanceof Error?e.message:'Could not load messages.');}
  },[dealId]);
  useEffect(()=>{void load()},[load]);
  async function send(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();const message=draft.trim();if(message.length<2||busy)return;
    setBusy(true);setError('');
    try{
      const r=await fetch('/api/deals/'+dealId+'/negotiation',{method:'POST',headers:{'content-type':'application/json'},credentials:'include',body:JSON.stringify({message})});
      const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not send message.');
      setMessages(old=>[...old,d]);setDraft('');
    }catch(e){setError(e instanceof Error?e.message:'Could not send message.');}
    finally{setBusy(false);}
  }
  return <section id="discussion" className="card" style={{padding:21}}>
    <div className="eyebrow"><MessageCircle size={13}/> Deal discussion</div>
    <p className="dealmeta">Keep scope clarifications and negotiation notes with the deal. Formal agreement changes still require a new agreement version and approval.</p>
    <div style={{display:'grid',gap:9,maxHeight:280,overflowY:'auto',padding:'8px 0'}}>
      {messages.length===0?<p className="dealmeta">No messages yet. Start the conversation with the other participant.</p>:messages.map(m=><article key={m.id} style={{justifySelf:m.isMine?'end':'start',maxWidth:'92%',padding:10,borderRadius:12,background:m.isMine?'#EEF2FF':'#F6F3EC'}}>
        <div style={{fontSize:10,fontWeight:700,color:'#334155'}}>{m.isMine?'You':m.actor}</div>
        <p style={{fontSize:12,lineHeight:1.5,whiteSpace:'pre-wrap',margin:'5px 0',color:'#334155'}}>{m.message}</p>
        <div style={{fontSize:9,color:'#64748B'}}>{new Date(m.createdAt).toLocaleString()}</div>
      </article>)}
    </div>
    {error&&<p className="error" role="alert">{error}</p>}
    <form onSubmit={send} style={{display:'flex',gap:8,alignItems:'end',marginTop:10}}>
      <textarea value={draft} onChange={e=>setDraft(e.target.value)} maxLength={2000} rows={2} placeholder="Clarify a requirement or discuss a change…" aria-label="Deal discussion message" style={{flex:1,minWidth:0,border:'1px solid #EADFCB',borderRadius:9,padding:10,fontSize:12,resize:'vertical'}}/>
      <button className="primary" type="submit" disabled={busy||draft.trim().length<2} aria-label="Send message"><Send size={14}/></button>
    </form>
  </section>;
}
