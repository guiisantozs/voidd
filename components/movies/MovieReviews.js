import {ShareReviewButton} from '../review-share/ReviewShare';
import { profileHref,withIdentities } from '../../lib/usernames';
import { ProfileAvatar } from '../profile/ProfileUI';
import Icon from '../Icon';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { tmdbDisplayRating } from '../../lib/ratings';
import { useEffect, useState } from 'react';
import { useAccount } from '../AccountProvider';
import MovieReviewForm from './MovieReviewForm';
import { cleanReviewText, reviewError } from '../../lib/review-detail';


export function ReviewAvatar({name}){return <span className="md-avatar" aria-hidden="true">{(name||'V').slice(0,1).toUpperCase()}</span>;}
const dateLabel=value=>value?new Date(value).toLocaleDateString('pt-BR'):'';
const score=value=>value==null?'—':Number(value).toLocaleString('pt-BR',{maximumFractionDigits:1});
function Failure({retry}){return <div className="md-section-error" role="status"><p>Não foi possível carregar esta seção.</p><button onClick={retry}>Tentar novamente</button></div>;}
function Loading(){return <div className="md-review-skeleton m-skeleton" role="status" aria-label="Carregando avaliações"/>;}

export function ReviewCard({review,movieKey,onChange,openComments=false,interactive=true}) {
  const {user,client}=useAccount();const [revealed,setRevealed]=useState(false),[expanded,setExpanded]=useState(false),[comments,setComments]=useState(null),[commentError,setCommentError]=useState(false),[loading,setLoading]=useState(false),[body,setBody]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[report,setReport]=useState(null),[reason,setReason]=useState('');
  async function act(operation,after){setBusy(true);setMessage('');try{const {error}=await operation();if(error)throw error;await after?.();}catch(error){setMessage(reviewError(error));}finally{setBusy(false);}}
  async function loadComments(more=false){setLoading(true);setCommentError(false);try{const {data,error}=await client.rpc('void_movie_review_comments',{movie_key:movieKey,author_id:review.user_id,page_offset:more?comments.comments.length:0});if(error)throw error;data.comments=await withIdentities(client,data.comments);setComments(old=>({...data,comments:more?[...(old?.comments||[]),...data.comments]:data.comments}));}catch{setCommentError(true);}finally{setLoading(false);}}
  const target={review_user:review.user_id,item_key:movieKey};
  useEffect(()=>{if(openComments&&client)loadComments();},[openComments,client,review.user_id,movieKey]);
  const spoiler=review.spoiler&&!revealed;
  return <article className="md-review-card"><header><Link href={profileHref(review)}><ProfileAvatar profile={review}/><strong>{review.display_name}<small className="void-person-handle">{review.username?`@${review.username}`:''}</small></strong></Link><span className="md-review-note"><Icon name="star" />{" "}{score(review.rating)}<small>/5</small></span></header>{(review.targetLabel||movieKey.startsWith('series:'))&&<p className="md-review-target">{review.targetLabel||'Série inteira'}</p>}<p className="md-review-meta"><time dateTime={review.updated_at}>{dateLabel(review.updated_at)}</time>{review.is_friend&&<span>Amigo</span>}{review.rewatched&&<span>Revi</span>}{review.unpopular&&<span className="md-unpopular">Opinião impopular</span>}</p><div className={spoiler?'md-spoiler-wrap':''}><p className={`md-review-text ${!expanded?'md-review-clamp':''} ${spoiler?'md-spoiler':''}`} aria-hidden={spoiler||undefined}>{review.text||'Avaliou sem deixar comentário.'}</p>{spoiler&&<button className="md-spoiler-reveal" onClick={()=>setRevealed(true)}>Mostrar spoiler</button>}</div>{!spoiler&&review.text.length>280&&<button className="md-text-action" onClick={()=>setExpanded(v=>!v)}>{expanded?'Mostrar menos':'Ler review completa'}</button>}
    {interactive&&<div className="md-review-actions">{movieKey.startsWith('filmes:')&&<ShareReviewButton owner={review.user_id} itemKey={movieKey}/>}{user?<button disabled={busy} aria-pressed={review.liked} onClick={()=>act(()=>review.liked?client.from('void_review_likes').delete().eq('user_id',user.id).eq('review_user',review.user_id).eq('item_key',movieKey):client.from('void_review_likes').insert({...target,user_id:user.id}),onChange)}>{review.liked?<Icon name="heart" />:<Icon name="heart" />} {review.likes} {Number(review.likes)===1?'curtida':'curtidas'}</button>:<Link href="/conta"><Icon name="heart" />{" "}{review.likes} {Number(review.likes)===1?'curtida':'curtidas'} · entre para curtir</Link>}<button disabled={loading} onClick={()=>comments?setComments(null):loadComments()}>Comentários ({review.comments})</button>{user&&<button onClick={()=>{setReport({});setReason('');}}>Denunciar</button>}</div>}
    {(comments||loading||commentError)&&<section className="md-comments" aria-label={`Comentários na avaliação de ${review.display_name}`}>
      {commentError&&<Failure retry={()=>loadComments()}/>}{comments?.comments.map(comment=><article key={comment.id}><Link href={profileHref(comment)}><ProfileAvatar profile={comment}/><strong>{comment.display_name}<small className="void-person-handle">{comment.username?`@${comment.username}`:''}</small></strong></Link><time dateTime={comment.created_at}>{dateLabel(comment.created_at)}</time><p className="md-review-text">{comment.body}</p>{user&&<div className="md-review-actions">{comment.user_id===user.id&&<button disabled={busy} onClick={()=>act(()=>client.from('void_review_comments').delete().eq('id',comment.id).eq('user_id',user.id),async()=>{await loadComments();onChange();})}>Apagar comentário</button>}<button onClick={()=>{setReport({id:comment.id});setReason('');}}>Denunciar</button></div>}</article>)}
      {loading&&<p role="status">Carregando comentários…</p>}{comments&&!comments.comments.length&&<p className="md-muted">Comece a conversa.</p>}{comments&&comments.comments.length<comments.total&&<button disabled={loading} onClick={()=>loadComments(true)}>Carregar mais comentários</button>}
      {user?<form onSubmit={e=>{e.preventDefault();act(()=>client.from('void_review_comments').insert({...target,user_id:user.id,body:cleanReviewText(body,1000)}),async()=>{setBody('');await loadComments();onChange();});}}><label>Responder à review<textarea required maxLength={1000} rows={2} value={body} onChange={e=>setBody(e.target.value)}/></label><button disabled={busy||!body.trim()}>Enviar comentário</button></form>:<Link href="/conta">Entre para comentar</Link>}
    </section>}
    {report&&<form className="md-report-form" onSubmit={e=>{e.preventDefault();act(()=>client.from('void_review_reports').insert({...target,user_id:user.id,comment_id:report.id||null,reason:cleanReviewText(reason,500)}),()=>{setReport(null);setMessage('Denúncia registrada para análise.');});}}><label>Motivo da denúncia<textarea required minLength={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy||reason.trim().length<3}>Enviar denúncia</button><button type="button" onClick={()=>setReport(null)}>Cancelar</button></form>}
    <p className="md-feedback" role="status">{message}</p>
  </article>;
}

export function useMovieReviewSummary(id,refreshKey=0,media='filmes') {
  const {client,user}=useAccount();const [state,setState]=useState({loading:true});const [revision,setRevision]=useState(0);
  useEffect(()=>{if(!client){setState({error:true});return;}let active=true;setState({loading:true});client.rpc('void_movie_review_summary_v2',{movie_key:`${media}:${id}`}).then(async({data,error})=>{if(error)throw error;data.friends=await withIdentities(client,data.friends);if(active)setState({data});}).catch(()=>{if(active)setState({error:true});});return()=>{active=false;};},[id,client,user?.id,revision,refreshKey,media]);
  return {...state,refresh:()=>setRevision(n=>n+1)};
}

export default function MovieReviews({movie,summary,communityOnly=false}) {
  const router=useRouter();
  const [targeted,setTargeted]=useState({});
  const {client,user}=useAccount();const [sort,setSort]=useState('recent'),[range,setRange]=useState('all'),[offset,setOffset]=useState(0),[revision,setRevision]=useState(0),[feed,setFeed]=useState({loading:true,rows:[]}),[friends,setFriends]=useState({loading:true});
  const movieKey=`${movie.categoria||'filmes'}:${movie.id}`;
  const targetAuthor=typeof router.query.review==='string'&&/^[a-f0-9-]{36}$/i.test(router.query.review)?router.query.review:null;
  useEffect(()=>{
    if(communityOnly||!client||!targetAuthor)return;
    let active=true;setTargeted({loading:true});
    client.rpc('void_notification_review',{author_id:targetAuthor,movie_key:movieKey}).then(async({data,error})=>{
      if(error)throw error;
      const rows=data?await withIdentities(client,[data]):[];
      if(active){setTargeted({review:rows[0]});requestAnimationFrame(()=>document.getElementById('notification-target-review')?.scrollIntoView({block:'start'}));}
    }).catch(()=>{if(active)setTargeted({error:true});});
    return()=>{active=false;};
  },[client,targetAuthor,movieKey,communityOnly,revision,user?.id]);
  const refresh=()=>{setOffset(0);setRevision(n=>n+1);if(!communityOnly)summary.refresh();};
  useEffect(()=>{
    if(!client){setFeed({error:true,rows:[]});return;}let active=true;setFeed(old=>({...old,loading:true,error:false}));
    const [min,max]=range==='all'?[0,5]:range.split('-').map(Number);
    client.rpc('void_movie_review_page_v2',{movie_key:movieKey,sort_by:sort,min_rating:min,max_rating:max,page_offset:offset}).then(async({data,error})=>{if(!active)return;if(error){setFeed(old=>({...old,loading:false,error:true}));return;}data.reviews=await withIdentities(client,data.reviews);if(!active)return;setFeed(old=>({rows:offset?[...old.rows,...data.reviews.filter(r=>!old.rows.some(v=>v.user_id===r.user_id))]:data.reviews,total:data.total}));}).catch(()=>{if(active)setFeed(old=>({...old,loading:false,error:true}));});
    return()=>{active=false;};
  },[client,movieKey,sort,range,offset,revision,user?.id]);
  useEffect(()=>{
    if(communityOnly||!client||!user)return;let active=true;setFriends({loading:true});client.rpc('void_movie_review_page_v2',{movie_key:movieKey,friends_only:true}).then(async({data,error})=>{if(error)throw error;data.reviews=await withIdentities(client,data.reviews);if(active)setFriends({rows:data.reviews,total:data.total});}).catch(()=>{if(active)setFriends({error:true});});return()=>{active=false;};
  },[client,movieKey,user?.id,revision,communityOnly]);
  const data=summary.data;const maximum=Math.max(1,...(data?.histogram||[]).map(p=>p.total));
  return <div className={communityOnly?'md-reviews md-reviews--preview':'md-reviews'}>{!communityOnly&&<><section className="md-rating-summary"><h2><Icon name="user" />{" Notas da comunidade"}</h2>{summary.loading?<Loading/>:summary.error?<Failure retry={summary.refresh}/>:<><div className="md-score-pair">{data.total>0&&<div><strong>{score(data.average)}</strong><span>Nota VOID / 5</span></div>}{Number.isFinite(tmdbDisplayRating(movie))&&<div><strong>{score(tmdbDisplayRating(movie))}</strong><span>{movie.externalRatingSource||'TMDB'} / 5</span></div>}<p>{data.total} avaliações públicas</p></div><div className="md-histogram" role="img" aria-label={`Distribuição das notas. ${data.histogram.map(p=>`Nota ${p.rating}: ${p.total}`).join('; ')}`}>{data.histogram.map(p=><div key={p.rating} title={`Nota ${p.rating}: ${p.total} avaliações`}><span style={{height:`${Math.max(2,p.total/maximum*78)}px`}}/><small>{p.rating}</small></div>)}</div>{!data.total&&<p className="md-muted">Seja o primeiro a avaliar e publicar sua opinião.</p>}</> }</section>
    {user&&<section className="md-friend-summary"><h3>Seu círculo no VOID</h3>{data?<><p><strong>{data.friendCount} dos seus amigos já viram</strong> · média {score(data.friendAverage)}/5</p><div className="md-friend-avatars">{data.friends.map(friend=><Link key={friend.user_id} href={profileHref(friend)} title={`${friend.display_name}: ${score(friend.rating)}/5`}><ReviewAvatar name={friend.display_name}/><span>{score(friend.rating)}</span></Link>)}</div>{!data.friendCount&&<Link href="/amigos">{"Encontre amigos para compartilhar suas próximas sessões "}<Icon name="arrow-up-right" /></Link>}</>:<p className="md-muted">O resumo dos amigos aparece quando as notas carregarem.</p>}</section>}
    <MovieReviewForm movie={movie} onSaved={refresh}/>
    {user&&<section><h2><Icon name="users" />{" Avaliações dos amigos"}</h2>{friends.loading?<Loading/>:friends.error?<Failure retry={()=>setRevision(n=>n+1)}/>:!friends.rows?.length?<p className="md-muted">Seus amigos ainda não publicaram avaliações desta obra.</p>:<>{friends.rows.map(review=><ReviewCard key={review.user_id} review={review} movieKey={movieKey} onChange={refresh}/>)}{friends.total>friends.rows.length&&<button onClick={()=>{setSort('friends');setRange('all');setOffset(0);document.getElementById('md-community-heading')?.scrollIntoView({block:'start'});}}>Ver mais na comunidade</button>}</>}</section>}
    </>}<section><div className="md-community-heading"><h2 id="md-community-heading"><Icon name="sparkle" />{" Avaliações da comunidade"}</h2><div><label>Ordenar <select value={sort} onChange={e=>{setSort(e.target.value);setOffset(0);}}><option value="recent">Mais recentes</option><option value="likes">Mais curtidas</option><option value="friends">Amigos primeiro</option></select></label><label>Notas <select value={range} onChange={e=>{setRange(e.target.value);setOffset(0);}}><option value="all">Todas</option><option value="0-2">0–2</option><option value="2.1-3.5">2,1–3,5</option><option value="3.6-5">3,6–5</option></select></label></div></div>
    {!communityOnly&&targetAuthor&&<section id="notification-target-review" aria-label="Avaliação da notificação">{targeted.loading?<Loading/>:targeted.error?<Failure retry={refresh}/>:targeted.review?<ReviewCard review={targeted.review} movieKey={movieKey} onChange={refresh} openComments={router.query.comments==='1'}/>:<p role="status">Esta avaliação não está mais disponível.</p>}</section>}{feed.error&&<Failure retry={()=>setRevision(n=>n+1)}/>} {!feed.loading&&!feed.error&&!feed.rows.length&&<p className="md-muted">Nenhuma avaliação nesta seleção. Seja o primeiro a avaliar.</p>}{feed.rows.map(review=><ReviewCard key={review.user_id} review={review} movieKey={movieKey} onChange={refresh}/>)}{feed.loading&&<Loading/>}{feed.rows.length<feed.total&&!feed.error&&<button className="md-load-more" disabled={feed.loading} onClick={()=>setOffset(feed.rows.length)}>Carregar mais</button>}</section>
  </div>;
}
