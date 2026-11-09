'use client';
import {useCallback,useEffect,useState} from 'react';
import {Bell} from 'lucide-react';
export function NotificationBell(){
 const [count,setCount]=useState(0);
 const refresh=useCallback(async()=>{try{const r=await fetch('/api/notifications',{credentials:'include',cache:'no-store'});if(r.ok){const data=await r.json();setCount(Number(data.unreadCount)||0)}}catch{}},[]);
 useEffect(()=>{void refresh();const timer=window.setInterval(refresh,60000);window.addEventListener('focus',refresh);return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh)}},[refresh]);
 return <a href="/notifications" aria-label="Notifications" style={{position:'relative',color:'#64748B'}}><Bell size={18}/>{count>0&&<span aria-live="polite" style={{position:'absolute',right:-8,top:-8,minWidth:16,height:16,borderRadius:10,background:'#DC2626',color:'#fff',fontSize:9,textAlign:'center',lineHeight:'16px'}}>{count>9?'9+':count}</span>}</a>
}