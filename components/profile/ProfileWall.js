import Link from 'next/link';
import {useRef,useState} from 'react';
import Icon from '../Icon';
import {useAccount} from '../AccountProvider';
import {ProfileAvatar,ProfileError,ProfileSkeleton} from './ProfileUI';
import {useProfileContent} from '../../lib/use-profile-content';
import {contentError,profileContentChanged} from '../../lib/profile-content';
import {profileHref} from '../../lib/usernames';

export default function ProfileWall({target}){
 const {client,user}=useAccount(),state=useProfileContent(target,'wall'),[body,setBody]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),lock=useRef(false),account=useRef(user?.id);account.current=user?.id;
 async function mutate(comment){
  if(!user||lock.current)return;const owner=user.id;lock.current=true;setBusy(true);setMessage('');
  try{
   const request=comment?client.from('profile_comments').delete().eq('id',comment.id).eq('profile_id',target).select('id'):client.from('profile_comments').insert({profile_id:target,user_id:owner,body:body.trim()}).select('id');
   const {data,error}=await request;if(error||!data?.length)throw error||Error();if(account.current!==owner)return;
   if(!comment)setBody('');setMessage(comment?'Recado apagado.':'Recado publicado.');profileContentChanged();
  }catch(error){if(account.current===owner)setMessage(contentError(error));}finally{lock.current=false;if(account.current===owner)setBusy(false);}
 }
 return <section className="vp-section vp-wall"><div className="vp-section-title"><h2>Mural de comentários</h2><span>{state.total??0} recados</span></div>{user?<form onSubmit={e=>{e.preventDefault();mutate();}}><label htmlFor="profile-wall-body">Deixe um recado<textarea id="profile-wall-body" value={body} onChange={e=>setBody(e.target.value)} maxLength={500} rows={3} required disabled={busy}/></label><div><small>{body.length}/500 · Até 5 recados por minuto</small><button className="vp-primary" disabled={busy||!body.trim()||body.trim().length>500}>Publicar recado</button></div></form>:<p className="vp-empty"><Link href="/conta">Entre na sua conta</Link> para deixar um recado.</p>}<p className="vp-feedback" role="status" aria-live="polite">{message}</p>{state.error&&<ProfileError retry={state.refresh}/>}<ol className="vp-wall-comments">{state.rows.map(comment=><li key={comment.id}><ProfileAvatar profile={comment}/><div><Link href={profileHref(comment)}>{comment.display_name||'Pessoa do Void'}</Link>{comment.username&&<small>@{comment.username}</small>}<p>{comment.body}</p><time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString('pt-BR')}</time></div>{(user?.id===target||user?.id===comment.user_id)&&<button type="button" disabled={busy} onClick={()=>mutate(comment)} aria-label="Apagar recado" title="Apagar recado"><Icon name="minus"/></button>}</li>)}</ol>{state.loading&&<ProfileSkeleton small/>}{!state.loading&&!state.error&&!state.rows.length&&<p className="vp-empty">Nenhum recado por aqui ainda.</p>}{state.rows.length<state.total&&!state.error&&<button className="vp-load-more" disabled={state.loading} onClick={state.more}>Carregar mais</button>}</section>;
}
