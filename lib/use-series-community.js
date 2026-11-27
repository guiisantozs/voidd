import {useCallback,useEffect,useRef,useState} from 'react';
import {useAccount} from '../components/AccountProvider';
import {DATA_EVENT} from './account-storage';
import {seriesCommunity,seriesFriends,seriesRecommendations} from './series-social';
import {createRefreshQueue} from './refresh-queue';
export function useSeriesCommunity({includeRecommendations=true,enabled=true,media='series'}={}){
 const {client,user}=useAccount(),scope=`${media}:${user?.id||'guest'}`,[state,setState]=useState({}),requests=useRef(new Map()),queues=useRef(new Map());
 const [stateScope,setStateScope]=useState(scope);
 const read=useCallback(async key=>{
  requests.current.get(key)?.abort();const controller=new AbortController();requests.current.set(key,controller);setState(old=>({...old,[key]:{loading:true}}));
  try{if(key!=='community'&&!user){setState(old=>({...old,[key]:{movies:[],invite:true}}));return;}if(!client)throw Error('CONFIG');const data=await (key==='community'?seriesCommunity(client,controller.signal,media):key==='friends'?seriesFriends(client,user.id,controller.signal,media):seriesRecommendations(client,user.id,controller.signal));if(!controller.signal.aborted)setState(old=>({...old,[key]:data}));}
  catch{if(!controller.signal.aborted)setState(old=>({...old,[key]:{error:'Esta seleção está indisponível agora.'}}));}
 },[client,scope]);
 const load=useCallback((key,options)=>{if(!queues.current.has(key))queues.current.set(key,createRefreshQueue(()=>read(key)));return queues.current.get(key).refresh(options);},[read]);
 useEffect(()=>{setStateScope(scope);setState({});if(!enabled)return;const keys=includeRecommendations?['recommended','friends','community']:['friends','community'];setState({});keys.forEach(key=>load(key));const refresh=()=>{if(document.visibilityState!=='hidden')keys.forEach(key=>load(key,{changed:true}));};window.addEventListener(DATA_EVENT,refresh);window.addEventListener('focus',refresh);return()=>{queues.current.forEach(queue=>queue.dispose());queues.current.clear();requests.current.forEach(controller=>controller.abort());requests.current.clear();window.removeEventListener(DATA_EVENT,refresh);window.removeEventListener('focus',refresh);};},[load,includeRecommendations,enabled]);
 return {sections:stateScope===scope?state:{},load};
}
