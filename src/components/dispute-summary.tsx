'use client';

import {useState} from 'react';
import {FileSearch,RefreshCw,Sparkles} from 'lucide-react';

export function DisputeSummary({dealId}:{dealId:string}){
  const [summary,setSummary]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
  async function load(){
    setBusy(true);setMessage('');
    try{
      const response=await fetch('/api/deals/'+dealId+'/disputes/summary',{credentials:'include',cache:'no-store'});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Unable to prepare summary.');
      setSummary(data.summary||'');
      setMessage(data.message||(!data.configured?'AI summary is not configured.': ''));
      setLoaded(true);
    }catch(error){setMessage(error instanceof Error?error.message:'Unable to prepare summary.');}
    finally{setBusy(false);}
  }
  return <section className="card" style={{padding:21}}>
    <div className="eyebrow"><FileSearch size={13}/> Neutral dispute brief</div>
    <p className="dealmeta">Summarize the recorded agreement, evidence, and dispute history. This is an organizational aid, not a decision or legal opinion.</p>
    <button className="secondary" disabled={busy} onClick={()=>void load()}><Sparkles size={14}/>{busy?'Preparing…':loaded?'Refresh summary':'Generate dispute summary'}</button>
    {message&&<p className="dealmeta" role="status">{message}</p>}
    {summary&&<div style={{whiteSpace:'pre-wrap',fontSize:12,lineHeight:1.7,color:'#334155',background:'#F8F7F3',borderRadius:10,padding:12,marginTop:12}}>{summary}</div>}
    {loaded&&<button className="secondary" style={{marginTop:8}} disabled={busy} onClick={()=>void load()}><RefreshCw size={13}/> Refresh from latest records</button>}
  </section>;
}
