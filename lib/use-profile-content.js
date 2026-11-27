import {useEffect,useState} from 'react';
import {useAccount} from '../components/AccountProvider';
import {PROFILE_CONTENT_EVENT,profileContentPage,profileComments} from './profile-content';
import {DATA_EVENT} from './account-storage';
import {LISTS_EVENT} from './lists';

export function useProfileContent(target,type,year){
 const {client,user}=useAccount(),[offset,setOffset]=useState(0),[revision,setRevision]=useState(0),[state,setState]=useState({rows:[],loading:true});
 const scope=`${user?.id||'guest'}:${target}:${type}:${year||''}`;
 useEffect(()=>{setOffset(0);},[scope]);
 useEffect(()=>{
  const refresh=()=>{setOffset(0);setRevision(n=>n+1);};
  const focus=()=>{if(document.visibilityState!=='hidden')refresh();};
  for(const event of [PROFILE_CONTENT_EVENT,DATA_EVENT,LISTS_EVENT])window.addEventListener(event,refresh);
  window.addEventListener('focus',focus);
  return()=>{for(const event of [PROFILE_CONTENT_EVENT,DATA_EVENT,LISTS_EVENT])window.removeEventListener(event,refresh);window.removeEventListener('focus',focus);};
 },[]);
 useEffect(()=>{
  if(!client)return;const abort=new AbortController();setState(old=>({...old,scope,rows:old.scope===scope&&offset?old.rows:[],loading:true,error:false}));
  const args={target,page_offset:offset,...(type==='diary'?{activity_year:year}:{})};
  const request=type==='wall'?profileComments(client,target,offset,abort.signal):profileContentPage(client,`void_profile_${type==='diary'?'diary':'activity'}_page`,args,abort.signal);
  request.then(data=>{if(!abort.signal.aborted)setState(old=>({...data,scope,rows:offset&&old.scope===scope?[...old.rows,...data.rows.filter(row=>!old.rows.some(prior=>(prior.id||prior.item_key||prior.event_key)===(row.id||row.item_key||row.event_key)))]:data.rows}));}).catch(()=>{if(!abort.signal.aborted)setState(old=>({...old,error:true,loading:false}));});
  return()=>abort.abort();
 },[client,scope,offset,revision]);
 const current=state.scope===scope?state:{rows:[],loading:true};
 return {...current,refresh:()=>{setOffset(0);setRevision(n=>n+1);},more:()=>setOffset(current.rows.length)};
}
