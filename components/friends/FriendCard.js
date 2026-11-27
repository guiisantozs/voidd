import Link from 'next/link';
import Icon from '../Icon';
import { memo,useRef,useState } from 'react';
import { ProfileAvatar } from '../profile/ProfileUI';
import Poster from '../Poster';
import { profileHref } from '../../lib/usernames';
import { workHref } from '../../lib/work-client';
import { connectionTime } from '../../lib/friends';
import { friendPoster } from '../../lib/friend-activity';
import { parseRating } from '../../lib/ratings';

export function FriendReview({review,now,excerpt=false}) {
  const [category,...identifier]=review.item_key.split(':');
  const item={...review.item,categoria:category,id:identifier.join(':')},rating=parseRating(review.rating);
  return <Link prefetch={false} className="circle-review" href={workHref(item)}><Poster item={{...item,poster:friendPoster(item.poster)}} sizes="55px"/><span><strong>{item.titulo||'Ver obra'}</strong><span className="circle-review-rating"><Icon name="star"/> {Number.isFinite(rating)?rating.toLocaleString('pt-BR',{minimumFractionDigits:1}):'—'} <small>/ 5</small></span>{excerpt&&(review.spoiler?<span className="circle-muted">Contém spoilers · abra a obra para ler</span>:review.text&&<span className="circle-review-excerpt">{review.text}</span>)}<time dateTime={review.updated_at}>{connectionTime(review.updated_at,now)}</time></span></Link>;
}
function FriendCard({person,review,loading,error,busy,onRemove,onBlock,now}) {
  const [confirm,setConfirm]=useState(false),trigger=useRef(null);
  function close(){setConfirm(false);requestAnimationFrame(()=>trigger.current?.focus());}
  return <article className="circle-person circle-rich-friend"><Link prefetch={false} className="circle-person-link" href={profileHref(person)}><span className="circle-avatar-ring"><ProfileAvatar lazySigning profile={person}/></span><span className="circle-person-name"><strong>{person.display_name}</strong><small>{person.username?`@${person.username}`:'aguardando criar @'}</small></span></Link>
    <div className="circle-friend-activity">{loading?<span className="circle-review-loading m-skeleton" aria-label="Carregando última avaliação" role="status"/>:error?<p className="circle-muted">A última avaliação não pôde ser carregada.</p>:review?<><p className="circle-kicker">ÚLTIMA AVALIAÇÃO PÚBLICA</p><FriendReview review={review} now={now}/></>:<p className="circle-muted">Nenhuma avaliação pública disponível.</p>}</div>
    <div className="circle-rich-actions"><Link prefetch={false} className="circle-profile-action" href={profileHref(person)}>Ver perfil <Icon name="arrow-up-right"/></Link><details className="circle-friend-menu" onKeyDown={e=>{if(e.key==='Escape'){e.currentTarget.open=false;trigger.current?.focus();}}}><summary ref={trigger} aria-label={`Opções da amizade com ${person.display_name}`}><Icon name="more"/></summary><button disabled={busy} onClick={e=>{e.currentTarget.closest('details').open=false;setConfirm(true);}}>Remover amizade</button>{onBlock&&<button disabled={busy} onClick={e=>{e.currentTarget.closest('details').open=false;setConfirm('block');}}>Bloquear contato</button>}</details></div>
    {confirm&&<div className="circle-remove-confirm" role="group" aria-label={`${confirm==='block'?'Confirmar bloqueio':'Confirmar remoção'} de ${person.display_name}`}><p>{confirm==='block'?'Bloquear este contato? Isso encerra a amizade e a participação nas listas entre vocês.':'Remover esta amizade?'}{confirm!=='block'&&person.mutual?' Você também deixará de seguir essa pessoa.':''}</p><button className="circle-danger" disabled={busy} onClick={async()=>{if(await (confirm==='block'?onBlock(person):onRemove(person)))setConfirm(false);}}>{confirm==='block'?'Sim, bloquear':'Sim, remover'}</button><button disabled={busy} autoFocus onClick={close}>Cancelar</button></div>}
  </article>;
}

export default memo(FriendCard);
