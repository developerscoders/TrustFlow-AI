'use client';

import {usePathname} from 'next/navigation';
import {Activity,FileText,LayoutDashboard,MessageCircle,WalletCards,Layers3} from 'lucide-react';

const dashboardItems=[{id:'overview',label:'Overview',Icon:LayoutDashboard},{id:'deals',label:'My deals',Icon:Layers3}];
const dealItems=[{id:'agreement',label:'Agreement',Icon:FileText},{id:'milestones',label:'Milestones',Icon:Layers3},{id:'payment',label:'Payment',Icon:WalletCards},{id:'discussion',label:'Discussion',Icon:MessageCircle},{id:'activity',label:'Activity',Icon:Activity}];

export function WorkspaceDock(){
  const pathname=usePathname();
  const items=pathname==='/dashboard'?dashboardItems:pathname?.startsWith('/deals/')?dealItems:null;
  if(!items)return null;
  function jump(id:string){document.getElementById(id)?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
  return <nav className="workspace-dock" aria-label="Workspace quick navigation">
    {items.map(({id,label,Icon})=><button key={id} type="button" title={label} aria-label={'Go to '+label} onClick={()=>jump(id)}><Icon size={17}/><span>{label}</span></button>)}
  </nav>;
}
