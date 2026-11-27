import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/router';
import Icon,{RatingStars} from '../Icon';
import {useAccount} from '../AccountProvider';
import {ProfilePoster} from '../profile/ProfileUI';
import GameCover from '../GameCover';
import AddToList from './AddToList';
import {DATA_EVENT,REVIEWS_KEY,scopedStorage} from '../../lib/account-storage';
import {formatRating} from '../../lib/catalog';
import {parseRating} from '../../lib/ratings';
import {LISTS_EVENT,listError,listItemKey,listMedia,listsChanged,readList,writeList} from '../../lib/lists';
import {readMovieList,readWatchlist,watchlistKey} from '../../lib/movie-watchlist';
import {workHref} from '../../lib/work-client';

export function ListItemsSkeleton(){return <div className="vl-work-grid" role="status" aria-label="Carregando obras">{Array.from({length:5},(_,i)=><div className="vl-work-skeleton" key={i}><div className="m-skeleton"/><p className="m-skeleton"/><p className="m-skeleton"/><p className="m-skeleton"/></div>)}</div>;}

export default function ListItems({list,onChange,onBusy,disabled=false,local=false,loading=false}) {
 const {client,user,ready}=useAccount(),router=useRouter();
 const [reviews,setReviews]=useState({}),[members,setMembers]=useState(new Set()),[filter,setFilter]=useState('all'),[view,setView]=useState('grid'),[busy,setBusy]=useState(false),[undo,setUndo]=useState(null),[message,setMessage]=useState('');
 const lock=useRef(false),live=useRef(true),timer=useRef(null),latest=useRef(list);latest.current=list;
 const owner=local||!!user&&list.owner_id===user.id,items=list.items||[];
 useEffect(()=>{live.current=true;return()=>{live.current=false;clearTimeout(timer.current);};},[]);
 useEffect(()=>{try{setView(localStorage.getItem('void:list-view')==='compact'?'compact':'grid');}catch{}},[]);
 useEffect(()=>{
  function refresh(){try{setReviews(JSON.parse(scopedStorage(localStorage,user?.id||null).getItem(REVIEWS_KEY)||'{}'));}catch{setReviews({});}}
  refresh();window.addEventListener(DATA_EVENT,refresh);window.addEventListener('storage',refresh);window.addEventListener('focus',refresh);
  return()=>{window.removeEventListener(DATA_EVENT,refresh);window.removeEventListener('storage',refresh);window.removeEventListener('focus',refresh);};
 },[user?.id]);
 useEffect(()=>{
  if(owner||!user||!client)return;let active=true,generation=0;
  async function refresh(){const token=++generation;try{
   const found=new Set();for(let offset=0;;offset+=500){const {data,error}=await client.from('list_items').select('media_type,external_id,lists!inner(owner_id)').eq('lists.owner_id',user.id).range(offset,offset+499);if(error)throw error;data.forEach(entry=>found.add(listItemKey(entry)));if(data.length<500)break;}
   Object.values(readMovieList(scopedStorage(localStorage,user.id))).forEach(item=>found.add(listItemKey(item)));
   Object.values(readWatchlist(scopedStorage(localStorage,user.id),'series')).forEach(item=>found.add(listItemKey(item)));
   if(active&&token===generation)setMembers(found);
  }catch{/* Membership is informational; never infer it from another account. */}}
  refresh();window.addEventListener(LISTS_EVENT,refresh);window.addEventListener(DATA_EVENT,refresh);
  return()=>{active=false;window.removeEventListener(LISTS_EVENT,refresh);window.removeEventListener(DATA_EVENT,refresh);};
 },[client,user?.id,owner]);
 function changeView(value){setView(value);try{localStorage.setItem('void:list-view',value);}catch{}}
 async function mutate(entry,restore=false){
  if(!owner||disabled||lock.current)return;lock.current=true;setBusy(true);onBusy?.(true);setMessage('');
  const previous=latest.current,index=restore?undo.index:previous.items.findIndex(item=>listItemKey(item)===listItemKey(entry));
  const next=previous.items.filter(item=>listItemKey(item)!==listItemKey(entry));if(restore)next.splice(Math.min(index,next.length),0,entry);
  onChange({...previous,items:next});
  try{
   if(local||previous.source_key){
    const media=previous.source_key==='anime_watchlist'||previous.media_types?.[0]==='animes'?'animes':previous.source_key==='series_watchlist'||previous.media_types?.[0]==='series'?'series':'filmes';
    const storage=scopedStorage(localStorage,user?.id||null),saved=readWatchlist(storage,media);
    if(restore)saved[entry.external_id]=entry.snapshot;else delete saved[entry.external_id];
    storage.setItem(watchlistKey(media),JSON.stringify(saved));
    if(!user)window.dispatchEvent(new Event(DATA_EVENT));
   }else{
    await writeList(client,previous.id,previous,next,previous.updated_at);
    const fresh=await readList(client,previous.id);if(!fresh)throw Error();if(live.current)onChange(fresh);
   }
   if(!live.current)return;
   clearTimeout(timer.current);setUndo(restore?null:{entry,index});setMessage(restore?'Obra restaurada.':'Removido da lista');
   if(!restore)timer.current=setTimeout(()=>setUndo(null),8000);
   listsChanged();
  }catch(error){if(live.current){onChange(previous);setMessage(listError(error));}}
  finally{lock.current=false;if(live.current){setBusy(false);onBusy?.(false);}}
 }
 const rated=entry=>Number.isFinite(parseRating(reviews[listItemKey(entry)]?.nota));
 const count=items.filter(rated).length,visible=items.map((entry,index)=>({entry,index})).filter(({entry})=>filter==='all'||rated(entry)===(filter==='rated'));
 return <section className="vl-works" aria-label="Obras da lista">
  {user&&<div className="vl-progress"><span>Você avaliou {count} de {items.length}</span><progress max={items.length||1} value={count} aria-label={`Você avaliou ${count} de ${items.length}`}/></div>}
  <div className="vl-works-tools"><div role="group" aria-label="Filtrar obras">{[['all','Todos'],['rated','Avaliados'],['unrated','Para avaliar']].map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}</button>)}</div><div role="group" aria-label="Visualização">{[['grid','Grade'],['compact','Lista compacta']].map(([key,label])=><button key={key} aria-pressed={view===key} onClick={()=>changeView(key)}>{label}</button>)}</div></div>
  <div className="vl-item-feedback" role="status" aria-live="polite"><span>{message}</span>{undo&&<button disabled={busy||disabled} onClick={()=>mutate(undo.entry,true)}>Desfazer</button>}</div>
  {loading||!ready?<ListItemsSkeleton/>:!visible.length?<p className="vl-empty">Nenhuma obra aqui ainda</p>:<ol className={`vl-work-grid ${view==='compact'?'vl-work-compact':''}`}>{visible.map(({entry,index})=>{
   const item={...entry.snapshot,categoria:entry.media_type,id:entry.external_id},score=parseRating(reviews[listItemKey(entry)]?.nota),reviewed=Number.isFinite(score);
   const href={pathname:'/avaliar',query:{categoria:item.categoria,id:item.id,editar:reviewed?'1':undefined,lista:router.asPath.split('?')[0]}};
   return <li key={listItemKey(entry)}><article className="vl-work-card"><Link className="vl-work-poster" href={workHref(item)} aria-label={`Ver ${item.titulo}`}>{item.categoria==='jogos'?<GameCover item={item}/>:<ProfilePoster item={item}/>}</Link><div className="vl-work-body"><div className="vl-work-title">{list.ranked&&<span className="vl-work-rank">{index+1}</span>}<h3><Link href={workHref(item)}>{item.titulo}</Link></h3></div><p className="vl-work-meta">{item.ano||'Ano não informado'} · {listMedia.find(([key])=>key===item.categoria)?.[2]}</p><p className="vl-work-note" title={entry.note||undefined}>{entry.note||'\u00a0'}</p><div className="vl-work-actions"><Link className={reviewed?'vl-work-rating':'vl-primary'} href={href} aria-label={reviewed?`Editar avaliação de ${item.titulo}, nota ${formatRating(score)} de 5`:`Avaliar ${item.titulo}`}>{reviewed?<><RatingStars value={score}/><span>{formatRating(score)}</span></>:<>Avaliar<Icon name="edit"/></>}</Link>{owner?<button disabled={busy||disabled} aria-label="Remover da lista" title={`Remover ${item.titulo} da lista`} onClick={()=>mutate(entry)}><Icon name="minus"/></button>:<AddToList item={item} label="Salvar"/>}</div>{!owner&&<small className="vl-work-membership">{members.has(listItemKey(entry))?'Na sua lista':'\u00a0'}</small>}</div></article></li>;
  })}</ol>}
 </section>;
}
