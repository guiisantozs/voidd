import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import Icon from '../Icon';
import { useAccount } from '../AccountProvider';
import { ProfileAvatar } from '../profile/ProfileUI';
import { profileHref, withIdentities } from '../../lib/usernames';
import { cleanReviewText, reviewError } from '../../lib/review-detail';

export default function FeedComments({ review, actions }) {
  const { client, user } = useAccount();
  const regionId=useId();
  const [open,setOpen]=useState(false),[data,setData]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[body,setBody]=useState(''),[busy,setBusy]=useState(false);
  const scope=`${user?.id||'guest'}:${review.user_id}:${review.item_key}`, live=useRef(scope),lock=useRef(false),sequence=useRef(0);
  live.current=scope;
  useEffect(()=>()=>{live.current='';sequence.current++;},[]);
  async function load(more=false) {
    const ticket=++sequence.current;setLoading(true);setError('');
    try {
      const {data:result,error:failure}=await client.rpc('void_movie_review_comments',{movie_key:review.item_key,author_id:review.user_id,page_offset:more?data?.comments.length||0:0});
      if(failure)throw failure;
      const comments=await withIdentities(client,result.comments||[]);
      if(live.current===scope&&ticket===sequence.current)setData(old=>({...result,comments:more?[...(old?.comments||[]),...comments]:comments}));
    } catch {if(live.current===scope&&ticket===sequence.current)setError('Não foi possível carregar os comentários.');}
    finally {if(live.current===scope&&ticket===sequence.current)setLoading(false);}
  }
  async function act(operation) {
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try {const {error:failure}=await operation();if(failure)throw failure;if(live.current!==scope)return;setBody('');await load();}
    catch(failure){if(live.current===scope)setError(reviewError(failure));}
    finally {lock.current=false;if(live.current===scope)setBusy(false);}
  }
  return <div className="gr-comments"><div className="gr-social">{actions}<button type="button" aria-expanded={open} aria-controls={regionId} onClick={()=>{setOpen(value=>!value);if(!open&&!data&&!loading)load();}}><Icon name="list"/><span>Comentar</span></button></div>{open&&<section id={regionId} aria-label="Comentários da avaliação">
    {data?.comments.map(comment=><article key={comment.id}><Link className="gr-comment-author" href={profileHref(comment)}><ProfileAvatar profile={comment}/><strong>{comment.display_name||'Pessoa do VOID'}{comment.username&&<small>@{comment.username}</small>}</strong></Link><time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleDateString('pt-BR')}</time><p>{comment.body}</p>{comment.user_id===user?.id&&<button disabled={busy} onClick={()=>act(()=>client.from('void_review_comments').delete().eq('id',comment.id).eq('user_id',user.id))}>Apagar comentário</button>}</article>)}
    {loading&&<p role="status">Carregando comentários…</p>}{error&&<div role="alert"><p>{error}</p><button disabled={loading} onClick={()=>load()}>Tentar novamente</button></div>}{data&&!data.comments.length&&!loading&&<p>Comece a conversa.</p>}
    {data&&data.comments.length<data.total&&<button disabled={loading} onClick={()=>load(true)}>Carregar mais comentários</button>}
    {user?<form onSubmit={event=>{event.preventDefault();act(()=>client.from('void_review_comments').insert({review_user:review.user_id,item_key:review.item_key,user_id:user.id,body:cleanReviewText(body,1000)}));}}><label>Responder à avaliação<textarea required maxLength={1000} rows={3} value={body} onChange={event=>setBody(event.target.value)}/></label><button disabled={busy||!body.trim()}>{busy?'Enviando…':'Enviar comentário'}</button></form>:<Link href="/conta">Entre para comentar</Link>}
  </section>}</div>;
}
