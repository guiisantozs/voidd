import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useAccount} from '../AccountProvider';
import {ProfileAvatar} from '../profile/ProfileUI';
import {socialRpc,socialError} from '../../lib/social-community';
import {SEARCH_DELAY_MS,normalizeSearchTerm} from '../../lib/catalog-cache-policy';
import {createScopedSearchCache} from '../../lib/scoped-search-cache';

// Identity and eligibility are resolved in one paged, authenticated backend lookup.
export default function PeoplePicker({target=null,mode='friends',onSend,label='Enviar convites',children}){
 const {client,user}=useAccount(),[query,setQuery]=useState(''),[page,setPage]=useState(0),[attempt,setAttempt]=useState(0),[state,setState]=useState({loading:true}),[selected,setSelected]=useState([]),[sent,setSent]=useState([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const searchCache=useRef(createScopedSearchCache());
 useEffect(()=>{setSelected([]);setSent([]);searchCache.current.clear();},[user?.id,target,mode]);
 const lock=useRef(false),live=useRef(true);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{
  const abort=new AbortController(),term=normalizeSearchTerm(query).replace(/^@/,'');
  if((mode==='search'&&term.length<2)||term.length===1){setState({rows:[]});return()=>abort.abort();}
  const scope=JSON.stringify([user?.id||'guest',target,mode,attempt]),key=JSON.stringify([term.toLocaleLowerCase('pt-BR'),page]);
  const cached=searchCache.current.get(scope,key);if(cached){setState(cached);return()=>abort.abort();}
  setState({loading:true});
  const timer=setTimeout(()=>socialRpc(client,'void_social_people',{target,mode,term,page_number:page},abort.signal).then(rows=>{if(!abort.signal.aborted){const data={rows:rows.slice(0,20),more:rows.length>20};searchCache.current.set(scope,key,data);setState(data);}}).catch(()=>{if(!abort.signal.aborted)setState({error:true});}),SEARCH_DELAY_MS);
  return()=>{clearTimeout(timer);abort.abort();};
 },[client,user?.id,target,mode,query,page,attempt]);
 async function send(){
  if(lock.current||!selected.length)return;lock.current=true;setBusy(true);setMessage('');
  try{const result=await onSend(selected),done=Array.isArray(result)?result:result?.sent||selected;if(live.current){setSent(old=>[...new Set([...old,...done])]);setSelected(old=>old.filter(id=>!done.includes(id)));setMessage(result?.message||'Envio concluído.');searchCache.current.clear();setAttempt(n=>n+1);}}
  catch(error){if(live.current){setMessage(socialError(error));setAttempt(n=>n+1);}}
  finally{lock.current=false;if(live.current)setBusy(false);}
 }
 return <div className="vs-picker" aria-busy={busy}>
  <label>{mode==='friends'?'Pesquisar amigos':'Buscar por nickname'}<input type="search" value={query} maxLength={50} placeholder={mode==='friends'?'Nome ou @nickname':'@nickname'} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label>
  {state.loading?<p role="status">Carregando pessoas…</p>:state.error?<p role="alert">Não foi possível carregar. <button type="button" onClick={()=>setAttempt(n=>n+1)}>Tentar novamente</button></p>:<>
   {!state.rows?.length&&<p className="vs-muted">{(mode==='search'&&query.trim().length<2)||query.trim().length===1?'Digite pelo menos dois caracteres.':mode==='friends'?'Nenhum amigo disponível. Encontre pessoas na aba Amigos.':'Nenhum usuário encontrado.'}</p>}
   <ul className="vs-person-list">{state.rows?.map(p=>{
    const pending=p.status==='pending'||sent.includes(p.user_id),accepted=p.status==='accepted',disabled=busy||pending||accepted;
    return <li key={p.user_id}><ProfileAvatar profile={p}/><span><Link href={`/pessoas/${p.user_id}`}><strong>{p.display_name}</strong></Link><small>@{p.username}</small></span><label className="vs-selection"><input type="checkbox" disabled={disabled||(!selected.includes(p.user_id)&&selected.length>=20)} checked={selected.includes(p.user_id)} onChange={e=>setSelected(old=>e.target.checked?[...old,p.user_id]:old.filter(id=>id!==p.user_id))}/><span>{accepted?'Já participa':pending?'Convite enviado':selected.includes(p.user_id)?'Selecionado':'Selecionar'}<span className="notification-sr"> {p.display_name}</span></span></label></li>;
   })}</ul>
   <div className="vs-paging">{page>0&&<button type="button" disabled={busy} onClick={()=>setPage(n=>n-1)}>Anteriores</button>}{state.more&&<button type="button" disabled={busy} onClick={()=>setPage(n=>n+1)}>Mais pessoas</button>}</div>
  </>}
  {children}
  <button type="button" className="vs-primary" disabled={busy||!selected.length} onClick={send}>{busy?'Enviando…':label}{selected.length?` (${selected.length})`:''}</button><p role="status" aria-live="polite">{message}</p>
 </div>;
}
