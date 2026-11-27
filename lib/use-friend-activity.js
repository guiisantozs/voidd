import { useCallback,useEffect,useRef,useState } from 'react';
import { useAccount } from '../components/AccountProvider';
import { loadFriendActivity } from './friend-activity';

// Section-local requests/errors: failed activity never blocks connections.
export function useFriendActivity(latest,revision,enabled=true) {
  const {user,client}=useAccount(),owner=user?.id;
  const [state,setState]=useState({});const current=useRef(owner),controller=useRef(null),generation=useRef(0),snapshot=useRef({});current.current=owner;
  const load=useCallback(async(more=false)=>{
    if(!enabled||!owner||!client)return;
    const previous=snapshot.current.owner===owner?snapshot.current:{};
    if(more&&(!previous.has_more||previous.loading))return;
    controller.current?.abort();const abort=new AbortController();controller.current=abort;const token=++generation.current;
    const pending={...(more?previous:{}),owner,loading:true,more,error:false};snapshot.current=pending;setState(pending);
    try{
      const data=await loadFriendActivity(client,{latest,cursor:more?previous.cursor:null,signal:abort.signal});
      if(abort.signal.aborted||current.current!==owner||generation.current!==token)return;
      const rows=more?[...(previous.rows||[]),...data.rows]:data.rows;
      const unique=[...new Map(rows.map(r=>[`${r.user_id}:${r.item_key}`,r])).values()];
      const next={owner,...data,rows:unique,loading:false};snapshot.current=next;setState(next);
    }catch{if(!abort.signal.aborted&&current.current===owner&&generation.current===token){const next={...(more?previous:{}),owner,loading:false,error:true,more};snapshot.current=next;setState(next);}}
  },[owner,client,latest,enabled]);
  useEffect(()=>{load();return()=>{controller.current?.abort();generation.current++;};},[load,revision]);
  const visible=state.owner===owner?state:{};
  return {...visible,rows:visible.rows||[],loading:enabled&&!!owner&&(visible.loading||!visible.rows&&!visible.error),refresh:()=>load(false),loadMore:()=>load(true)};
}
