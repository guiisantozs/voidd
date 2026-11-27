import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { MovieImage } from '../movies/MovieUI';
import Icon, { RatingStars } from '../Icon';
import LikeButton from '../LikeButton';
import FollowButton from '../profile/FollowButton';
import { ProfileAvatar } from '../profile/ProfileUI';
import { useAccount } from '../AccountProvider';
import { formatRating } from '../../lib/catalog';
import { profileHref } from '../../lib/usernames';
import FeedComments from './FeedComments';
export function relativeReviewTime(value, now=Date.now()) {
  const seconds=Math.max(0,Math.floor((now-Date.parse(value))/1000));
  if(!Number.isFinite(seconds))return '';
  const formatter=new Intl.RelativeTimeFormat('pt-BR',{numeric:'auto'});
  if(seconds<60)return 'agora';if(seconds<3600)return formatter.format(-Math.floor(seconds/60),'minute');
  if(seconds<86400)return formatter.format(-Math.floor(seconds/3600),'hour');return formatter.format(-Math.floor(seconds/86400),'day');
}
export default function SeriesReviewCard({ review, index, community }) {
  const {user}=useAccount(),[revealed,setRevealed]=useState(false),[expanded,setExpanded]=useState(false);
  const copy=useRef(null),[overflow,setOverflow]=useState(false),[art,setArt]=useState(null);
  const item=review.item,hidden=review.spoiler&&!revealed&&!!review.text?.trim(),own=review.user_id===user?.id;
  const href=`/obra/${item.categoria||'series'}/${item.id}`,text=review.text||'',hasText=!!text.trim();
  useEffect(()=>{
    if(expanded||!copy.current)return;
    const measure=()=>{if(copy.current)setOverflow(copy.current.scrollHeight>copy.current.clientHeight+1);};measure();
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(measure):null;observer?.observe(copy.current);
    window.addEventListener('resize',measure);return()=>{observer?.disconnect();window.removeEventListener('resize',measure);};
  },[expanded,text]);
  const ratingColor=Number(review.rating)>=4?'#c6a5ff':Number(review.rating)>=2.5?'#e6c46c':'#f29a9f';
  return <article className="gr-card" style={{'--enter-delay':`${Math.min(index,11)*40}ms`,'--review-rating':ratingColor,'--cover-art':art?`url(${JSON.stringify(art)})`:undefined}} onLoadCapture={event=>{
    const image=event.target;if(image.tagName==='IMG'&&image.closest('.gr-cover'))setArt(image.currentSrc||image.src);
  }}>
    <Link className="gr-cover" href={href} aria-label={`Ver ${item.titulo}`}><MovieImage movie={item}/></Link>
    <div className="gr-card-main"><div className="gr-title-line"><h2><Link href={href}>{item.titulo}</Link></h2>{item.ano&&<span>{item.ano}</span>}</div>
      <div className="gr-author-line"><Link className="gr-author" href={profileHref(review)}><ProfileAvatar profile={review}/><span><strong>{review.display_name||'Pessoa do VOID'}</strong>{review.username&&<small>@{review.username}</small>}</span></Link><span className="gr-author-badges">{own?<span className="gr-tag">Você</span>:community&&review.is_friend?<span className="gr-tag"><Icon name="users"/> Amigo</span>:null}<time dateTime={review.created_at} title={new Date(review.created_at).toLocaleString('pt-BR')}>{relativeReviewTime(review.created_at)}</time></span>
        <details className="gr-author-menu"><summary aria-label={`Ações da avaliação de ${review.display_name||'Pessoa do VOID'}`}><Icon name="more"/></summary><div>{own?<Link href={`${href}?tab=reviews`}><Icon name="edit"/> Editar avaliação</Link>:<FollowButton target={review.user_id} following={review.following}/>}</div></details>
      </div>
      <div className="gr-review-meta"><span className="gr-rating" aria-label={`Nota ${formatRating(Number(review.rating))} de 5`}><RatingStars value={Number(review.rating)}/><strong>{formatRating(Number(review.rating))}<small> / 5</small></strong></span></div>
      {hasText?<><div className="gr-copy-wrap"><p ref={copy} className={`gr-copy${!expanded?' gr-clamp':''}${hidden?' gr-spoiler':''}`} aria-hidden={hidden||undefined}>{text}</p>{hidden&&<button className="gr-reveal" onClick={()=>setRevealed(true)}><Icon name="contrast"/> Mostrar spoiler</button>}</div>{!hidden&&(overflow||expanded)&&<button className="gr-text-action" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?'Ler menos':'Ler mais'}</button>}</>:<div className="gr-copy-wrap gr-copy-empty" aria-hidden="true"/>}

    </div>
    <FeedComments review={review} actions={<LikeButton hideCount reviewUser={review.user_id} itemKey={review.item_key} likes={review.likes} liked={review.liked}/>}/>
  </article>;
}
