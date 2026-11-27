import Link from 'next/link';
import { useEffect,useRef,useState } from 'react';
import Icon from '../Icon';
import { ProfileAvatar } from '../profile/ProfileUI';
import { profileHref } from '../../lib/usernames';

export function CircleSkeleton({self=false}) {
  return <div className={`circle-skeleton ${self?'is-self':''}`} role="status" aria-label={self?'Carregando seu perfil':'Carregando conexões'}>{Array.from({length:self?1:3},(_,i)=><div key={i}><i className="m-skeleton"/><span><b className="m-skeleton"/><b className="m-skeleton"/></span></div>)}</div>;
}
export function CircleEmpty({icon='users',title,children}) {
  return <div className="circle-empty"><Icon name={icon}/><h3>{title}</h3><p>{children}</p></div>;
}
export function CirclePerson({person,children,meta,celebrating=false}) {
  return <article className={`circle-person ${celebrating?'is-celebrating':''}`}><Link prefetch={false} className="circle-person-link" href={profileHref(person)}><span className="circle-avatar-ring"><ProfileAvatar lazySigning profile={person}/></span><span className="circle-person-name"><strong>{person.display_name}</strong><small>{person.username?`@${person.username}`:'aguardando criar @'}</small>{meta}</span></Link><div className="circle-person-actions">{children}</div></article>;
}
export function YourCircleCard({profile,user,loading}) {
  const [feedback,setFeedback]=useState('');const timer=useRef(null);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  async function copy(){clearTimeout(timer.current);try{await navigator.clipboard.writeText(`@${profile.username}`);setFeedback('Copiado!');}catch{setFeedback('Não foi possível copiar.');}timer.current=setTimeout(()=>setFeedback(''),2500);}
  return <section className="circle-panel circle-self"><p className="circle-kicker">SEU LUGAR NO CÍRCULO</p><h2>Você</h2>{loading?<CircleSkeleton self/>:user?<><div className="circle-self-identity"><span className="circle-avatar-ring"><ProfileAvatar lazySigning profile={profile||{display_name:'Você'}} fallback="void"/></span><strong>{profile?.display_name||'Você'}</strong><div className="circle-self-handle"><span>{profile?.username?`@${profile.username}`:'aguardando criar @'}</span>{profile?.username&&<button type="button" onClick={copy} aria-label="Copiar seu @"><Icon name="list"/> {feedback==='Copiado!'?'Copiado!':'Copiar @'}</button>}</div><span className="circle-copy-feedback" role="status" aria-live="polite">{feedback}</span></div><Link prefetch={false} className="circle-edit-link" href="/perfil">Editar perfil <Icon name="arrow-up-right"/></Link></>:<><p className="circle-muted">Entre para fazer parte das conversas e encontrar seu círculo.</p><Link prefetch={false} className="circle-edit-link" href="/conta">Entrar no Void <Icon name="arrow-right"/></Link></>}</section>;
}
