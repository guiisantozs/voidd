import {useCallback,useEffect,useRef,useState} from 'react';
import {useAccount} from '../components/AccountProvider';
import {seriesPrivateRequest} from './series-preferences-client';
import {seriesMetadataClient} from './series-social';

export function useSeriesPersonalization(media='series'){
 const {client,user,ready}=useAccount(),owner=user?.id||null;
 const [state,setState]=useState({}),[open,setOpen]=useState(false),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState('');
 const alive=useRef(0),dismissed=useRef(false),requests=useRef(new Map()),snapshot=useRef(null),editing=useRef(false);editing.current=open;
 const recommendationSnapshot=useRef(null),lastRefresh=useRef(0);
 const request=useCallback((key)=>{requests.current.get(key)?.abort();const c=new AbortController();requests.current.set(key,c);return c;},[]);
 const recommendations=useCallback(async(force=false)=>{
  if(!owner||!client)return;
  const signature=snapshot.current,previous=recommendationSnapshot.current;
  if(force!==true&&previous?.signature===signature&&(previous.pending||previous.expires>Date.now()))return;
  const epoch=alive.current,c=request('recommendations'),stamp={signature,pending:true};recommendationSnapshot.current=stamp;setState(old=>({...old,recommendations:{loading:true}}));
  try{const data=await seriesPrivateRequest(client,owner,`/api/${media}/personalized`,{signal:c.signal});if(!c.signal.aborted&&epoch===alive.current){stamp.expires=Date.now()+(data.partial?60000:900000);setState(old=>({...old,recommendations:data}));}}
  catch{if(!c.signal.aborted&&epoch===alive.current)setState(old=>({...old,recommendations:{error:'Não foi possível carregar suas recomendações. Tente novamente.'}}));}
  finally{stamp.pending=false;}
 },[client,owner,request,media]);
 const refresh=useCallback(async()=>{
  if(!owner||!client||!ready)return;
  lastRefresh.current=Date.now();
  const epoch=alive.current,c=request('preferences');
  setState(old=>({...old,loading:!old.loaded,error:''}));
  try{
   const {preferences}=await seriesPrivateRequest(client,owner,`/api/${media}/preferences`,{signal:c.signal});
   if(c.signal.aborted||epoch!==alive.current)return;
   const signature=JSON.stringify(preferences?.ids||[]),changed=signature!==snapshot.current;snapshot.current=signature;
   setState(old=>({...old,owner,preferences,loaded:true,loading:false,error:'',...(!preferences?{items:[],recommendations:{movies:[]}}:changed?{items:null}:{})}));
   if(!preferences){if(!dismissed.current)setOpen(true);return;}
   recommendations();
   if(changed){try{const items=await seriesMetadataClient(preferences.ids,c.signal,fetch,{allowPartial:true,media});if(!c.signal.aborted&&epoch===alive.current)setState(old=>({...old,items}));}catch{if(!c.signal.aborted&&epoch===alive.current)setState(old=>({...old,items:null}));}}
  }catch(error){if(!c.signal.aborted&&epoch===alive.current)setState(old=>({...old,owner,loading:false,error:error.message,recommendations:{error:'Suas preferências estão indisponíveis. Tente novamente.'}}));}
 },[client,owner,ready,request,recommendations,media]);
 useEffect(()=>{
  alive.current++;dismissed.current=false;snapshot.current=null;recommendationSnapshot.current=null;lastRefresh.current=0;setOpen(false);setSaving(false);setSaveError('');setState({owner,loading:!!owner});refresh();
  const focused=()=>{if(document.visibilityState!=='hidden'&&!editing.current&&Date.now()-lastRefresh.current>=60000)refresh();};window.addEventListener('focus',focused);
  return()=>{alive.current++;requests.current.forEach(c=>c.abort());requests.current.clear();window.removeEventListener('focus',focused);};
 },[refresh]);
 const close=()=>{dismissed.current=true;setOpen(false);};
 async function edit(){
  setSaveError('');
  if(state.preferences&&!state.items){
   const epoch=alive.current,c=request('editor');
   try{const items=await seriesMetadataClient(state.preferences.ids,c.signal,fetch,{allowPartial:true,media});if(c.signal.aborted||epoch!==alive.current)return;setState(old=>({...old,items}));setOpen(true);}
   catch{if(!c.signal.aborted&&epoch===alive.current)setSaveError('Não foi possível abrir suas escolhas. Tente novamente.');}
  }else setOpen(true);
 }
 async function save(ids){
  if(saving)return;requests.current.get('preferences')?.abort();const epoch=alive.current,c=request('save');setSaving(true);setSaveError('');
  try{const data=await seriesPrivateRequest(client,owner,`/api/${media}/preferences`,{ids,signal:c.signal});if(c.signal.aborted||epoch!==alive.current)return;snapshot.current=JSON.stringify(data.preferences.ids);setState(old=>({...old,preferences:data.preferences,items:data.items,error:''}));dismissed.current=true;setOpen(false);recommendations();}
  catch(error){if(!c.signal.aborted&&epoch===alive.current)setSaveError(error.message);}
  finally{if(epoch===alive.current)setSaving(false);}
 }
 const current=state.owner===owner?state:{loading:!!owner};
 return {...current,open,close,edit,save,saving,saveError,retry:current.error?refresh:()=>recommendations(true)};
}
