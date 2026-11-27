import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import Icon from '../Icon';
import DetailModal from '../movies/DetailModal';
import {useAccount} from '../AccountProvider';
import {ProfilePoster,ProfileError,ProfileSkeleton} from './ProfileUI';
import {DATA_EVENT} from '../../lib/account-storage';
import {LISTS_EVENT} from '../../lib/lists';
import {PROFILE_CONTENT_EVENT,contentError,profileContentChanged,profileReviewHref} from '../../lib/profile-content';
import {formatRating} from '../../lib/catalog';
import {parseRating} from '../../lib/ratings';

function HighlightEditor({target,pins,onClose}){
 const {client,user}=useAccount(),[kind,setKind]=useState('review'),[slot,setSlot]=useState(1),[offset,setOffset]=useState(0),[attempt,setAttempt]=useState(0),[state,setState]=useState({rows:[],loading:true}),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),lock=useRef(false);
 useEffect(()=>{
  const abort=new AbortController();setState(old=>({...old,loading:true,error:false,rows:offset?old.rows:[]}));
  client.from('void_profile_highlight_options').select('*',{count:'exact'}).eq('user_id',target).eq('kind',kind).order('created_at',{ascending:false}).order('entity_id').range(offset,offset+19).abortSignal(abort.signal).then(({data,count,error})=>{if(abort.signal.aborted)return;if(error){setState(old=>({...old,loading:false,error:true}));return;}setState(old=>({rows:offset?[...old.rows,...data]:data,total:count}));}).catch(()=>{if(!abort.signal.aborted)setState(old=>({...old,loading:false,error:true}));});
  return()=>abort.abort();
 },[client,target,kind,offset,attempt]);
 async function pin(item){
  if(lock.current||user?.id!==target)return;lock.current=true;setBusy(true);setMessage('');
  try{const {error}=await client.from('profile_highlights').upsert({user_id:user.id,slot,kind,entity_id:item.entity_id},{onConflict:'user_id,slot'});if(error)throw error;profileContentChanged();setMessage(`Destaque ${slot} atualizado.`);}catch(error){setMessage(contentError(error));}finally{lock.current=false;setBusy(false);}
 }
 return <DetailModal title="Escolher destaques" className="vp-content-modal" onClose={()=>{if(!busy)onClose();}}><div className="vp-content-editor"><p>Fixe até três avaliações, listas ou conquistas suas. A privacidade de cada item continua valendo.</p><div className="vp-content-editor-tools"><label>Posição <select value={slot} disabled={busy} onChange={e=>setSlot(Number(e.target.value))}>{[1,2,3].map(number=><option key={number} value={number}>Destaque {number}</option>)}</select></label><label>Tipo <select value={kind} disabled={busy} onChange={e=>{setKind(e.target.value);setOffset(0);}}><option value="review">Avaliações</option><option value="list">Listas</option><option value="achievement">Conquistas</option></select></label></div>{state.error&&<ProfileError retry={()=>setAttempt(n=>n+1)}/>}<ul className="vp-highlight-options">{state.rows.map(item=><li key={item.entity_id}><button disabled={busy||pins.some(pin=>pin.kind===kind&&pin.entity_id===item.entity_id)} onClick={()=>pin(item)}>{(item.item?.poster||item.item?.categoria==='jogos')&&<ProfilePoster item={item.item} sizes="34px"/>}<span>{item.item?.titulo||'Conquista'}{item.data?.rating!=null&&<small>Nota {formatRating(parseRating(item.data.rating))}</small>}</span><Icon name="plus"/></button></li>)}</ul>{state.loading&&<ProfileSkeleton small/>}{!state.loading&&!state.error&&!state.rows.length&&<p className="vp-empty">Nenhum item disponível para fixar.</p>}{state.rows.length<state.total&&<button disabled={state.loading||busy} onClick={()=>setOffset(state.rows.length)}>Carregar mais</button>}<p className="vp-feedback" role="status" aria-live="polite">{message}</p></div></DetailModal>;
}

export default function ProfileHighlights({target,owner}){
 const {client,user}=useAccount(),[state,setState]=useState({loading:true,pins:[]}),[revision,setRevision]=useState(0),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),lock=useRef(false);
 const scope=`${user?.id||'guest'}:${target}`;
 useEffect(()=>{
  const refresh=()=>setRevision(n=>n+1);for(const event of [DATA_EVENT,LISTS_EVENT,PROFILE_CONTENT_EVENT,'focus'])window.addEventListener(event,refresh);
  return()=>{for(const event of [DATA_EVENT,LISTS_EVENT,PROFILE_CONTENT_EVENT,'focus'])window.removeEventListener(event,refresh);};
 },[]);
 useEffect(()=>{
  if(!client)return;const abort=new AbortController();setState(old=>({...old,scope,loading:true,error:false,pins:old.scope===scope?old.pins:[]}));
  client.rpc('void_profile_highlights',{target}).abortSignal(abort.signal).then(({data,error})=>{if(!abort.signal.aborted)setState(error?{scope,error:true,pins:[]}:{scope,pins:data});}).catch(()=>{if(!abort.signal.aborted)setState({scope,error:true,pins:[]});});
  return()=>abort.abort();
 },[client,scope,revision]);
 const current=state.scope===scope?state:{loading:true,pins:[]};
 async function remove(pin){
  if(!owner||lock.current)return;lock.current=true;setBusy(true);setMessage('');
  try{const {error}=await client.from('profile_highlights').delete().eq('user_id',user.id).eq('slot',pin.slot);if(error)throw error;profileContentChanged();setMessage('Destaque removido.');}catch(error){setMessage(contentError(error));}finally{lock.current=false;setBusy(false);}
 }
 return <section className="vp-section vp-highlights"><div className="vp-section-title"><h2>Destaques</h2>{owner&&<button onClick={()=>setEditing(true)} disabled={busy}>Escolher destaques</button>}</div>{current.error?<ProfileError retry={()=>setRevision(n=>n+1)}/>:current.loading&&!current.pins.length?<ProfileSkeleton small/>:!current.pins.length?<p className="vp-empty">Nenhum destaque por aqui ainda.</p>:<ol className="vp-highlight-grid">{current.pins.map(pin=>{
 const href=pin.kind==='list'?`/listas/${pin.entity_id}`:pin.kind==='review'?profileReviewHref(pin.item,target):null;
 const body=<>{(pin.item?.poster||pin.item?.categoria==='jogos')?<ProfilePoster item={pin.item} sizes="54px"/>:<span className="vp-highlight-symbol"><Icon name={pin.kind==='list'?'list':'diamond'}/></span>}<strong>{pin.item?.titulo||'Conquista'}</strong><small>{pin.kind==='review'?`Avaliação · ${formatRating(parseRating(pin.data.rating))}/5`:pin.kind==='list'?'Lista':'Conquista'}</small></>;
 return <li key={pin.slot}>{href?<Link href={href}>{body}</Link>:<div>{body}</div>}{owner&&<button disabled={busy} onClick={()=>remove(pin)} aria-label={`Desafixar ${pin.item?.titulo||'item'}`}><Icon name="minus"/> Desafixar</button>}</li>;
 })}</ol>}<p className="vp-feedback" role="status" aria-live="polite">{message}</p>{editing&&owner&&<HighlightEditor target={target} pins={current.pins} onClose={()=>setEditing(false)}/>}</section>;
}
