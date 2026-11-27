import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useAccount} from '../AccountProvider';
import {ProfileAvatar} from '../profile/ProfileUI';
import Icon from '../Icon';
import {socialRpc,socialError} from '../../lib/social-community';

export default function PeopleSuggestions({revision,onInvite,busy,unavailable=[]}){
 const {user,client}=useAccount(),[state,setState]=useState({loading:true}),[page,setPage]=useState(0),[pending,setPending]=useState([]),[message,setMessage]=useState(''),live=useRef(true),lock=useRef(false);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{if(!user)return;const abort=new AbortController();setState(old=>({...old,loading:true,error:false}));socialRpc(client,'void_social_suggestions',{},abort.signal).then(rows=>{if(!abort.signal.aborted)setState({rows});}).catch(()=>{if(!abort.signal.aborted)setState({error:true});});return()=>abort.abort();},[client,user?.id,page]);
 // Connection changes remove ineligible suggestions without spending another page.
 const rows=(state.rows||[]).filter(p=>!unavailable.includes(p.user_id)||pending.includes(p.user_id));
 async function invite(id){if(lock.current)return;lock.current=true;setPending(old=>[...old,id]);try{if(!await onInvite(id)&&live.current)setPending(old=>old.filter(p=>p!==id));}finally{lock.current=false;}}
 async function dismiss(id){try{await socialRpc(client,'void_social_suggestions',{dismiss:id});if(live.current)setState(old=>({...old,rows:old.rows.filter(p=>p.user_id!==id)}));}catch(error){if(live.current)setMessage(socialError(error));}}
 if(!user)return null;
 return <section className="circle-panel vs-suggestions" aria-label="Sugestões para você" data-connections-revision={revision}><header><div><p className="circle-kicker">NOVAS CONEXÕES</p><h2>Sugestões para você</h2></div><button type="button" disabled={state.loading} onClick={()=>{setPending([]);setPage(n=>n+1);}}>Ver mais <Icon name="arrow-right"/></button></header>{state.loading?<div className="vs-suggestion-skeleton m-skeleton" role="status" aria-label="Carregando sugestões"/>:state.error?<p role="alert">Não foi possível carregar. <button type="button" onClick={()=>setPage(n=>n+1)}>Tentar novamente</button></p>:!rows.length?<p className="vs-muted">Nenhuma nova sugestão por enquanto. Você pode encontrar pessoas pela busca acima.</p>:<ul className="vs-suggestion-track">{rows.map(p=><li key={p.user_id}><button type="button" className="vs-dismiss" aria-label={`Não sugerir ${p.display_name} novamente`} onClick={()=>dismiss(p.user_id)}><Icon name="close"/></button><Link className="vs-suggestion-person" href={`/pessoas/${p.user_id}`}><ProfileAvatar profile={p}/><strong>{p.display_name}</strong><small>@{p.username}</small></Link><p>{p.common_friends?`${p.common_friends} ${p.common_friends===1?'amigo em comum':'amigos em comum'}`:p.shared_tastes?'Vocês curtem histórias parecidas':'Descubra este perfil da comunidade'}</p><button type="button" className="vs-primary" disabled={!!busy||pending.includes(p.user_id)} onClick={()=>invite(p.user_id)}>{pending.includes(p.user_id)?'Solicitação enviada':'Adicionar amigo'}</button></li>)}</ul>}<p role="status">{message}</p></section>;
}
