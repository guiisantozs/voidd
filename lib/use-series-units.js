import {missingHighlightsColumn} from './series-review-highlights';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useAccount} from '../components/AccountProvider';
import {DATA_EVENT} from './account-storage';
import {unitKey} from './series-units';
import {publicCatalog} from './public-catalog-client';
async function allRows(build,signal){const rows=[];for(let offset=0;offset<20000;offset+=500){const {data,error}=await build().range(offset,offset+499).abortSignal(signal);if(error)throw error;rows.push(...data);if(data.length<500)return rows;}throw Error('TOO_MANY');}
export function useSeriesUnits(item,{enabled=true}={}){
 const {client,user}=useAccount(),id=item.id,[state,setState]=useState({loading:true,reviews:{},watched:{},summary:{}}),[seasons,setSeasons]=useState({}),[recent,setRecent]=useState([]),[revision,setRevision]=useState(0),requests=useRef(new Map()),[busy,setBusy]=useState({});
 const scope=`${user?.id||'guest'}:${item.categoria||'series'}:${id}`,currentScope=useRef(scope);currentScope.current=scope;
 const empty={scope,loading:true,reviews:{},watched:{},summary:{}},visible=state.scope===scope?state:empty;
 const refresh=useCallback(()=>setRevision(value=>value+1),[]);
 useEffect(()=>{
  const controller=new AbortController();setBusy({});if(!enabled){setState({...empty,loading:false});return;}if(!client){setState({...empty,loading:false,error:true});return;}
  setState(old=>({... (old.scope===scope?old:empty),loading:true,error:false}));
  const summary=client.rpc('void_series_unit_summary',{target_series:id}).abortSignal(controller.signal);
  let highlightsAvailable=false;
  async function loadMine(){
    if(!user)return [];
    const columns='season_number,episode_number,rating,text,spoiler,is_public,watched_on';
    const read=selected=>allRows(()=>client.from('void_series_unit_reviews').select(selected).eq('user_id',user.id).eq('series_id',id).order('season_number').order('episode_number'),controller.signal);
    try{const rows=await read(columns+',highlights');highlightsAvailable=true;return rows;}
    catch(error){if(!missingHighlightsColumn(error))throw error;return read(columns);}
  }
  const mine=loadMine();
  const watched=user?allRows(()=>client.from('void_series_episode_progress').select('season_number,episode_number').eq('user_id',user.id).eq('series_id',id).order('season_number').order('episode_number'),controller.signal):Promise.resolve([]);
  Promise.all([summary,mine,watched]).then(([result,reviews,progress])=>{if(result.error)throw result.error;if(controller.signal.aborted||currentScope.current!==scope)return;const key=row=>`${row.season_number}:${row.episode_number}`;setState({scope,highlightsAvailable,reviews:Object.fromEntries(reviews.map(row=>[key(row),{nota:Number(row.rating),texto:row.text,spoiler:row.spoiler,public:row.is_public,data:row.watched_on,highlights:row.highlights||[]}])),watched:Object.fromEntries(progress.map(row=>[key(row),true])),summary:Object.fromEntries((result.data||[]).map(row=>[key(row),row]))});}).catch(()=>{if(!controller.signal.aborted&&currentScope.current===scope)setState(old=>({...old,loading:false,error:true}));});
  return()=>controller.abort();
 },[client,user?.id,id,revision,enabled]);
 useEffect(()=>{window.addEventListener(DATA_EVENT,refresh);return()=>window.removeEventListener(DATA_EVENT,refresh);},[refresh]);
 useEffect(()=>{if(!enabled||item.categoria==='animes')return;const controller=new AbortController();setRecent([]);publicCatalog.request(`/api/series-detail?id=${id}&part=recent&media=${item.categoria||'series'}`,{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setRecent(data.episodes||[]);}).catch(()=>{});return()=>controller.abort();},[id,item.categoria,enabled]);
 useEffect(()=>()=>{requests.current.forEach(({controller})=>controller.abort());requests.current.clear();},[id]);
 const loadSeason=useCallback((season,force=false,page=1)=>{
  if(requests.current.has(season))return requests.current.get(season).task;
  if(!force&&page===1&&seasons[season]?.data)return Promise.resolve(seasons[season].data);
  const controller=new AbortController();setSeasons(old=>({...old,[season]:{...old[season],loading:true,error:false}}));
  const task=publicCatalog.request(`/api/series-detail?id=${id}&part=season&season=${season}&media=${item.categoria||'series'}&page=${page}`,{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setSeasons(old=>{const episodes=page>1?[...(old[season]?.data?.episodes||[]),...data.episodes]:data.episodes;return {...old,[season]:{data:{...data,episodes:[...new Map(episodes.map(row=>[row.episodeNumber,row])).values()]}}};});return data;}).catch(()=>{if(!controller.signal.aborted)setSeasons(old=>({...old,[season]:{...old[season],loading:false,error:true}}));return null;}).finally(()=>requests.current.delete(season));requests.current.set(season,{controller,task});return task;
 },[id,seasons,item.categoria]);
 async function write(unit,operation,form){
  if(!user||!client||currentScope.current!==scope)throw Error('UNAUTHORIZED');const key=unitKey(unit);setBusy(old=>({...old,[key]:true}));
  const progress=operation==='watch'||operation==='unwatch',before=!!visible.watched[key];
  if(progress)setState(old=>({...old,watched:{...old.watched,[key]:operation==='watch'}}));
  try{const {data,error}=await client.auth.getSession();if(error||!data.session?.access_token||data.session.user?.id!==user.id||currentScope.current!==scope)throw Error('Entre novamente para continuar.');const response=await fetch('/api/series-unit',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`},body:JSON.stringify({operation,media:item.categoria||'series',seriesId:id,seasonNumber:unit.seasonNumber,episodeNumber:unit.episodeNumber||0,form})});const result=await response.json();if(!response.ok)throw Error(result.erro);if(currentScope.current===scope)refresh();return result;}catch(error){if(progress&&currentScope.current===scope)setState(old=>({...old,watched:{...old.watched,[key]:before}}));throw error;}finally{if(currentScope.current===scope)setBusy(old=>({...old,[key]:false}));}
 }
 async function watchMany(episodes){if(!user||!client||currentScope.current!==scope)throw Error('Entre para continuar.');const {data,error}=await client.auth.getSession();if(error||data.session?.user?.id!==user.id||!data.session?.access_token)throw Error('Entre novamente para continuar.');let count=0;for(let offset=0;offset<episodes.length;offset+=25){if(currentScope.current!==scope)throw Error('Conta alterada.');const rows=episodes.slice(offset,offset+25).filter(row=>!visible.watched[unitKey(row)]);if(!rows.length)continue;const response=await fetch('/api/series-unit',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`},body:JSON.stringify({operation:'watch-many',media:'animes',seriesId:id,episodeNumbers:rows.map(row=>row.episodeNumber)})});const result=await response.json();if(!response.ok)throw Error(result.erro);if(currentScope.current!==scope)throw Error('Conta alterada.');count+=result.count;setState(old=>({...old,watched:{...old.watched,...Object.fromEntries(rows.map(row=>[unitKey(row),true]))}}));}refresh();window.dispatchEvent(new Event(DATA_EVENT));return count;}
 return {...visible,seasons,recent,busy:state.scope===scope?busy:{},loadSeason,refresh,write,watchMany};
}
