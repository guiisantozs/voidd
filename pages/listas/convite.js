import Head from 'next/head';
import Link from 'next/link';
import {useRouter} from 'next/router';
import {useEffect,useState,useRef} from 'react';
import MovieHeader from '../../components/movies/MovieHeader';
import {useAccount} from '../../components/AccountProvider';
import {ProfileAvatar} from '../../components/profile/ProfileUI';
import {socialRpc,socialError,safeSocialReturn} from '../../lib/social-community';
import {listsChanged} from '../../lib/lists';
export default function ListLinkPage(){const {user}=useAccount();return <div className="movies-page lists-page"><Head><title>Convite para uma lista — VOID</title><meta name="robots" content="noindex,nofollow"/><meta name="referrer" content="no-referrer"/></Head><MovieHeader current="listas"/><main className="vl-container"><Invite key={user?.id||'guest'}/></main></div>;}
function Invite(){
 const {client,user,ready}=useAccount(),router=useRouter(),[state,setState]=useState({loading:true}),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0),lock=useRef(false),live=useRef(true),token=router.query.token;
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 const target=safeSocialReturn(`/listas/convite?token=${typeof token==='string'?token:''}`);
 useEffect(()=>{if(!ready||!router.isReady||!user)return;const abort=new AbortController();setState({loading:true});if(!target){setState({error:'Convite inválido.'});return;}socialRpc(client,'void_list_join_link',{invite_token:token,join_now:false},abort.signal).then(data=>{if(!abort.signal.aborted)setState({data});}).catch(error=>{if(!abort.signal.aborted)setState({error:socialError(error)});});return()=>abort.abort();},[ready,router.isReady,client,user?.id,token,target,attempt]);
 async function join(){if(lock.current)return;lock.current=true;setBusy(true);try{const data=await socialRpc(client,'void_list_join_link',{invite_token:token,join_now:true});if(live.current){listsChanged();setState({data});}}catch(error){if(live.current)setState({error:socialError(error)});}finally{lock.current=false;if(live.current)setBusy(false);}}
 return <section className="vs-invite-preview"><p className="vl-overline">HISTÓRIAS MELHORES EM COMPANHIA</p><h1>Uma lista para compartilhar</h1>{!ready||!router.isReady?<p role="status">Carregando…</p>:!target?<p role="alert">Convite inválido.</p>:!user?<><p>Entre ou crie uma conta para conhecer a lista e confirmar sua participação.</p><Link className="vl-button vl-primary" href={`/conta?returnTo=${encodeURIComponent(target)}`}>Entrar para ver o convite</Link></>:state.loading?<p role="status">Consultando convite…</p>:state.error?<><p role="alert">{state.error}</p><button onClick={()=>setAttempt(n=>n+1)}>Tentar novamente</button></>:state.data&&<><ProfileAvatar profile={state.data.owner}/><p>{state.data.owner?.display_name} convidou você para</p><h2>{state.data.title}</h2><p>{state.data.description}</p><p className="vs-muted">Ao participar, você pode adicionar obras e compartilhar seu progresso. A privacidade das suas avaliações é preservada.</p>{state.data.joined?<Link className="vl-button vl-primary" href={`/listas/${state.data.id}`}>Abrir lista</Link>:<button className="vl-primary" disabled={busy} onClick={join}>{busy?'Entrando…':'Participar da lista'}</button>}</>}<p><Link href="/listas">Voltar às listas</Link></p></section>;
}
