import { useCallback,useEffect,useRef,useState } from 'react';
import { useAccount } from '../components/AccountProvider';
import { LISTS_EVENT,listsPage } from './lists';

export function useLists({mode='mine',sort='recent',owner=null,media=null,watchChanges=true}={}) {
  const {client,user,ready}=useAccount();const scope=`${user?.id||'guest'}:${mode}:${sort}:${owner||''}:${media||''}`;
  const [state,setState]=useState({}),generation=useRef(0),controller=useRef(null),current=useRef(scope),snapshot=useRef({});current.current=scope;
  const load=useCallback(async(more=false)=>{
    if(!ready)return;if(!client){setState({scope,error:true});return;}
    const previous=snapshot.current.scope===scope?snapshot.current:{};if(more&&(previous.loading||!previous.has_more))return;
    controller.current?.abort();const abort=new AbortController();controller.current=abort;const token=++generation.current;
    const page=more?(previous.page||0)+1:0,pending={...(more?previous:{}),scope,loading:true,more};snapshot.current=pending;setState(pending);
    try{const data=await listsPage(client,{mode,sort,owner,page,media,signal:abort.signal});if(abort.signal.aborted||current.current!==scope||token!==generation.current)return;const rows=[...new Map([...(more?previous.rows||[]:[]),...data.rows].map(l=>[l.id,l])).values()];const next={scope,...data,rows,page};snapshot.current=next;setState(next);}
    catch{if(!abort.signal.aborted&&current.current===scope&&token===generation.current){const next={...(more?previous:{}),scope,error:true,more};snapshot.current=next;setState(next);}}
  },[client,ready,scope,mode,sort,owner,media]);
  useEffect(()=>{load();const refresh=()=>{if(document.visibilityState!=='hidden')load();};window.addEventListener('focus',refresh);if(watchChanges)window.addEventListener(LISTS_EVENT,refresh);return()=>{controller.current?.abort();generation.current++;window.removeEventListener('focus',refresh);if(watchChanges)window.removeEventListener(LISTS_EVENT,refresh);};},[load,watchChanges]);
  const visible=state.scope===scope?state:{};
  return {...visible,rows:visible.rows||[],loading:!visible.error&&(!visible.rows||visible.loading),refresh:()=>load(),loadMore:()=>load(true)};
}
