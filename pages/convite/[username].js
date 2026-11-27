import Head from 'next/head';
import Link from 'next/link';
import { useEffect,useRef,useState } from 'react';
import { useRouter } from 'next/router';
import { useAccount } from '../../components/AccountProvider';
import MovieHeader from '../../components/movies/MovieHeader';
import { ProfileAvatar } from '../../components/profile/ProfileUI';
import FollowButton from '../../components/profile/FollowButton';
import { CircleSkeleton } from '../../components/friends/FriendsUI';
import { normalizeUsername,profileHref,usernameValid } from '../../lib/usernames';
import { inviteMessage,rememberInvite,requestFriend } from '../../lib/friend-invites';
import { CONNECTIONS_EVENT,connectionError } from '../../lib/friends';

export default function InvitePage() {
  const router=useRouter(),{client,user,ready}=useAccount();const handle=normalizeUsername(router.query.username);
  const [state,setState]=useState({}),[retry,setRetry]=useState(0),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[result,setResult]=useState(null);const owner=useRef(user?.id);owner.current=user?.id;
  useEffect(()=>{
    if(!router.isReady||!client||!ready)return;
    let active=true;setState({handle,loading:true});setNotice('');setResult(null);setBusy(false);
    if(!usernameValid(handle)){setState({handle,missing:true});return;}
    client.rpc('void_people_resolve',{handle}).then(({data,error})=>{
      if(!active)return;if(error)throw error;
      if(!data){setState({handle,missing:true});return;}
      setState({handle,person:data});
      if(!user){try{rememberInvite(localStorage,data.username);}catch{setNotice('Seu navegador não permitiu guardar o convite. Depois de entrar, volte a este link para enviar o pedido.');}}
    }).catch(()=>{if(active)setState({handle,error:true});});
    return()=>{active=false;};
  },[handle,router.isReady,client,ready,user?.id,retry]);
  const visible=state.handle===handle?state:{loading:true},person=visible.person;
  async function add(){if(busy||!person)return;const id=user.id;setBusy(true);setNotice('');try{const status=await requestFriend(client,person.username);if(owner.current!==id)return;setResult(status);setNotice(inviteMessage(status));window.dispatchEvent(new CustomEvent(CONNECTIONS_EVENT,{detail:{user_id:id}}));}catch(error){if(owner.current===id)setNotice(connectionError(error));}finally{if(owner.current===id)setBusy(false);}}
  return <div className="movies-page friends-page"><Head><title>Um convite para o seu círculo — VOID</title><meta name="robots" content="noindex"/></Head><MovieHeader current="amigos"/><main className="circle-container circle-invite-welcome"><section className="circle-panel"><p className="circle-kicker">BOAS HISTÓRIAS MERECEM COMPANHIA</p>{!ready||visible.loading?<CircleSkeleton self/>:visible.error?<><h1>Não conseguimos abrir este convite</h1><button onClick={()=>setRetry(n=>n+1)}>Tentar novamente</button></>:!person?<><h1>Este convite não está disponível</h1><p className="circle-muted">Confira o @ com quem enviou o link.</p><Link href="/filmes">Explorar o Void</Link></>:<><span className="circle-avatar-ring"><ProfileAvatar profile={person}/></span><h1>{person.display_name} <small>(@{person.username})</small> convidou você para o Void</h1><p className="circle-muted">Encontre seu próximo favorito e compartilhe as histórias que ficam com você.</p>{!user?<div className="circle-welcome-actions"><Link className="circle-edit-link" href="/conta?modo=signup">Criar conta</Link><Link className="circle-edit-link" href="/conta?modo=login">Já tenho conta · Entrar</Link></div>:person.user_id===user.id?<p>Este é seu convite. Compartilhe o link com seus amigos!</p>:<div className="circle-welcome-actions"><Link className="circle-edit-link" href={profileHref(person)}>Ver perfil</Link><button className="circle-primary" disabled={busy||!!result} onClick={add}>{busy?'Enviando…':result==='sent'?'Convite enviado':result==='friends'?'Amigos':result==='received'?'Convite recebido':'Adicionar'}</button><InviteFollow key={`${user.id}:${person.user_id}`} target={person.user_id}/></div>}<p className="circle-muted">O pedido de amizade depende do aceite da outra pessoa.</p></>}<p className="circle-copy-feedback" role="status" aria-live="polite">{notice}</p></section></main></div>;
}
function InviteFollow({target}) {
  const {client,user}=useAccount();const [following,setFollowing]=useState(null),[error,setError]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{let active=true;client.from('follows').select('followed_id').eq('follower_id',user.id).eq('followed_id',target).maybeSingle().then(({data,error:issue})=>{if(active){setError(!!issue);if(!issue)setFollowing(!!data);}}).catch(()=>{if(active)setError(true);});return()=>{active=false;};},[client,user.id,target,retry]);
  return error?<button onClick={()=>setRetry(n=>n+1)}>Recarregar seguimento</button>:following===null?<span role="status">Carregando…</span>:<FollowButton target={target} following={following} onChanged={()=>setRetry(n=>n+1)}/>;
}
