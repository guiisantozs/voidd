import Head from 'next/head';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/router';
import MovieHeader from '../../components/movies/MovieHeader';
import {useAccount} from '../../components/AccountProvider';
import {ProfileAvatar} from '../../components/profile/ProfileUI';
import {collaborationRpc} from '../../lib/list-collaboration';
import {listError,listsChanged} from '../../lib/lists';
export default function ListInvitations(){const {user}=useAccount();return <div className="movies-page lists-page"><MovieHeader current="listas"/><main className="vl-container"><Head><title>Convites para listas — VOID</title><meta name="robots" content="noindex"/></Head><Link className="vl-back" href="/listas">Voltar às listas</Link><h1>Convites para compartilhar histórias</h1><p>Ao aceitar, você poderá adicionar obras e compartilhar seu progresso. Suas avaliações mantêm a privacidade atual.</p><Invitations key={user?.id||'guest'}/></main></div>;}
function Invitations(){
 const {client,user,ready}=useAccount(),router=useRouter(),[state,setState]=useState({loading:true}),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{if(!ready||!user)return;let active=true;collaborationRpc(client,'void_list_inbox').then(data=>{if(active)setState({rows:data});}).catch(()=>{if(active)setState({error:true});});const timer=setInterval(()=>{if(document.visibilityState!=='hidden')setRevision(n=>n+1);},15000);return()=>{active=false;clearInterval(timer);};},[client,user?.id,ready,revision]);
 async function respond(list,action){if(busy)return;setBusy(true);setMessage('');try{await collaborationRpc(client,'void_list_invitation',{target:list.list_id,person:user.id,action});listsChanged();if(action==='accept')router.push('/listas/'+list.list_id);else{setRevision(n=>n+1);setMessage('Convite recusado.');}}catch(error){setMessage(listError(error));}finally{setBusy(false);}}
 if(!ready)return <p role="status">Carregando…</p>;if(!user)return <p><Link href={'/conta?returnTo='+encodeURIComponent(typeof router.query.lista==='string'&&/^[a-f0-9-]{36}$/.test(router.query.lista)?'/listas/convites?lista='+router.query.lista:'/listas/convites')}>Entre na sua conta</Link> para ver e responder aos seus convites.</p>;
 return <section className="vc-invitations">{state.loading?<p role="status">Carregando convites…</p>:state.error?<p role="alert">Não foi possível carregar. <button onClick={()=>setRevision(n=>n+1)}>Tentar novamente</button></p>:!state.rows?.length?<div className="vl-empty"><h2>Nenhum convite pendente</h2><p>Os convites enviados à sua conta aparecerão aqui.</p></div>:state.rows.map(list=><article key={list.list_id} className="vc-invitation"><ProfileAvatar profile={list}/><div><h2>{list.title}</h2><p>{list.display_name} convidou você</p></div><div className="vc-actions"><button className="vl-primary" disabled={busy} onClick={()=>respond(list,'accept')}>Aceitar</button><button disabled={busy} onClick={()=>respond(list,'decline')}>Recusar</button></div></article>)}<p role="status" aria-live="polite">{message}</p></section>;
}
