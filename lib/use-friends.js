import { useCallback,useEffect,useRef,useState } from 'react';
import { useAccount } from '../components/AccountProvider';
import { CONNECTIONS_EVENT,connectionError,loadConnections } from './friends';

export function useFriends() {
  const {user,client,ready}=useAccount();const owner=user?.id;
  const [state,setState]=useState({}),[job,setJob]=useState(null),[notice,setNotice]=useState(null);
  const controller=useRef(null),generation=useRef(0),current=useRef(owner),lock=useRef(null);
  current.current=owner;
  const refresh=useCallback(async()=>{
    if(!ready||!owner||!client)return;
    const token=++generation.current;controller.current?.abort();
    const abort=new AbortController();controller.current=abort;
    setState(old=>({... (old.owner===owner?old:{}),owner,loading:old.owner!==owner||!old.data,refreshing:true,error:false}));
    try{const data=await loadConnections(client,owner,abort.signal);if(!abort.signal.aborted&&current.current===owner&&token===generation.current)setState(old=>({owner,data,revision:(old.revision||0)+1}));}
    catch{if(!abort.signal.aborted&&current.current===owner&&token===generation.current)setState(old=>({...old,owner,loading:false,refreshing:false,error:true}));}
  },[client,owner,ready]);
  useEffect(()=>{
    current.current=owner;refresh();let timer;
    const schedule=event=>{if(document.visibilityState==='hidden'||event?.detail?.user_id&&event.detail.user_id!==owner)return;if(event?.type===CONNECTIONS_EVENT&&!event.detail?.silent)setNotice({owner,text:'Seguimento atualizado.'});clearTimeout(timer);timer=setTimeout(refresh,100);};
    window.addEventListener('focus',schedule);document.addEventListener('visibilitychange',schedule);window.addEventListener(CONNECTIONS_EVENT,schedule);
    return()=>{clearTimeout(timer);controller.current?.abort();generation.current++;if(current.current===owner)current.current=null;window.removeEventListener('focus',schedule);document.removeEventListener('visibilitychange',schedule);window.removeEventListener(CONNECTIONS_EVENT,schedule);};
  },[refresh,owner]);
  const run=useCallback(async(target,operation,success)=> {
    if(!owner||!client||lock.current===owner)return false;
    lock.current=owner;setJob({owner,target});setNotice(null);
    try{await operation();if(current.current!==owner)return false;await refresh();if(current.current===owner)setNotice({owner,text:success});return current.current===owner;}
    catch(error){if(current.current===owner){await refresh();if(current.current===owner)setNotice({owner,text:connectionError(error)});}return false;}
    finally{if(lock.current===owner)lock.current=null;if(current.current===owner)setJob(null);}
  },[owner,client,refresh]);
  const visible=state.owner===owner?state:{};
  return {...visible,loading:!!owner&&(!visible.data&&!visible.error||visible.loading),busy:job&&job.owner===owner?job.target:null,message:notice&&notice.owner===owner?notice.text:'',refresh,run};
}
