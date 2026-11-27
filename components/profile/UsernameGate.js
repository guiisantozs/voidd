import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useAccount } from '../AccountProvider';
import UsernameField from './UsernameField';
import DisplayNameField from './DisplayNameField';
import { suggestUsername, usernameError, usernameValid } from '../../lib/usernames';

export default function UsernameGate({children}) {
  const {user,client,ready,recovery}=useAccount();
  const router=useRouter();
  const [state,setState]=useState({}),[revision,setRevision]=useState(0),[value,setValue]=useState(''),[status,setStatus]=useState('idle'),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[check,setCheck]=useState(0);
  const edited=useRef(false),attempt=useRef(0);
  const [displayName,setDisplayName]=useState(''),[nameStatus,setNameStatus]=useState('idle');
  useEffect(()=>{const refresh=()=>setRevision(n=>n+1);window.addEventListener('void:identity-changed',refresh);return()=>window.removeEventListener('void:identity-changed',refresh);},[]);
  useEffect(()=>{
    if(!user||!client||!ready)return;let active=true;const owner=user.id;
    client.rpc('void_username_self').then(({data,error})=>{
      if(!active)return;if(error){setState({owner,error:true});return;}
      const label=data?.display_name&&data.display_name!=='Pessoa do VOID'?data.display_name:user.user_metadata?.display_name||user.user_metadata?.name||user.email?.split('@')[0]||'pessoa';
      setState({owner,profile:data,label});setDisplayName(label);edited.current=false;attempt.current=0;setValue(data?.username||suggestUsername(label));
    }).catch(()=>{if(active)setState({owner,error:true});});return()=>{active=false;};
  },[user?.id,client,ready,revision]);
  useEffect(()=>{if(status==='taken'&&!edited.current&&attempt.current<8){attempt.current++;setValue(suggestUsername(state.label,attempt.current));}},[status,state.label]);
  if(recovery&&router.pathname==='/conta')return children;
  if(!ready||user&&state.owner!==user.id)return <main className="void-onboarding"><p role="status">Carregando sua identidade…</p></main>;
  const needsCorrection=state.profile?.username_required||state.profile?.display_required||state.profile?.account_display_required;
  if(!user||usernameValid(state.profile?.username)&&!needsCorrection)return children;
  if(needsCorrection)return <main className="void-onboarding"><section><span className="logo">void.</span><h1>Corrija seu nome de perfil</h1><p>Um dos nomes da sua conta não atende às regras de convivência. Escolha um nome permitido para continuar. Sua conta e seu histórico serão preservados.</p><form onSubmit={async event=>{event.preventDefault();if(busy||nameStatus!=='allowed'||state.profile.username_required&&status!=='available')return;setBusy(true);setMessage('');try{const {error}=await client.rpc('void_profile_name_correct',{candidate:state.profile.username_required?value:state.profile.username,label:displayName});if(error)throw error;window.dispatchEvent(new Event('void:identity-changed'));}catch(error){setMessage(usernameError(error));}finally{setBusy(false);}}}><DisplayNameField value={displayName} onChange={setDisplayName} onStatus={setNameStatus} disabled={busy}/>{state.profile.username_required&&<UsernameField value={value} onChange={setValue} onStatus={setStatus} disabled={busy}/>}<button className="vp-primary" disabled={busy||nameStatus!=='allowed'||state.profile.username_required&&status!=='available'}>{busy?'Salvando…':'Salvar e continuar'}</button></form><p role="status" aria-live="polite">{message}</p><button type="button" disabled={busy} onClick={()=>client.auth.signOut()}>Sair da conta</button></section></main>;
  async function save(event){event.preventDefault();if(busy||status!=='available'||!usernameValid(value))return;setBusy(true);setMessage('');try{const {error}=await client.rpc('void_username_claim',{candidate:value});if(error)throw error;window.dispatchEvent(new Event('void:identity-changed'));}catch(error){setMessage(usernameError(error));setCheck(n=>n+1);}finally{setBusy(false);}}
  return <main className="void-onboarding"><section><span className="logo">void.</span><h1>Escolha seu @</h1><p>Seu nome de exibição pode se repetir. Seu @ é único e ajuda seus amigos a encontrar você.</p>{state.error?<><p role="alert">Não foi possível carregar seu perfil. Confira a conexão para continuar.</p><button onClick={()=>setRevision(n=>n+1)}>Tentar novamente</button></>:<form onSubmit={save}><UsernameField key={check} value={value} onChange={next=>{edited.current=true;setValue(next);}} onStatus={setStatus} disabled={busy}/><small>Você poderá alterar seu @ uma vez a cada 30 dias. O anterior fica reservado para você por 30 dias.</small><button className="vp-primary" disabled={busy||status!=='available'}>{busy?'Salvando…':'Continuar com este @'}</button></form>}<p role="status" aria-live="polite">{message}</p><button type="button" disabled={busy} onClick={()=>client.auth.signOut()}>Sair da conta</button></section></main>;
}
