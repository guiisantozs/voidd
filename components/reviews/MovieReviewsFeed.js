import MovieHeader from '../movies/MovieHeader';
import Head from 'next/head';
import LikeButton from '../LikeButton';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Icon, { RatingStars } from '../Icon';
import { ProfileAvatar } from '../profile/ProfileUI';
import { MovieImage } from '../movies/MovieUI';
import { useAccount } from '../AccountProvider';
import { formatRating } from '../../lib/catalog';
import { profileHref } from '../../lib/usernames';
import { COMMUNITY_PAGE_SIZE, loadCommunityReviews, reviewSearch } from '../../lib/community-reviews';
import { CONNECTIONS_EVENT } from '../../lib/friends';
import FeedAudienceSwitch from './FeedAudienceSwitch';
import {SEARCH_DELAY_MS} from '../../lib/catalog-cache-policy';

function CommunityCard({review}) {
  const [revealed,setRevealed]=useState(false),[expanded,setExpanded]=useState(false);
  const movie=review.movie, text=review.text || '', hidden=review.spoiler === true && !revealed;
  return <article className="cr-card">
    <Link className="cr-poster" href={`/filme/${movie.id}`} aria-label={`Ver ${movie.titulo}`}><MovieImage movie={movie}/></Link>
    <div className="cr-card-content"><div className="cr-film-title"><Link href={`/filme/${movie.id}`}>{movie.titulo}</Link>{movie.ano&&<small>{movie.ano}</small>}</div>
      <Link className="cr-author" href={profileHref(review)}><ProfileAvatar profile={review}/><span><strong>{review.display_name || 'Pessoa do Void'}</strong>{review.username&&<small>@{review.username}</small>}</span></Link>
      <p className="cr-rating" aria-label={`Nota ${formatRating(Number(review.rating))} de 5`}><RatingStars value={review.rating}/><strong>{formatRating(Number(review.rating))}<small> / 5</small></strong></p>
      <div className="cr-review-copy">{hidden?<button className="cr-spoiler" onClick={()=>setRevealed(true)}><Icon name="film"/> Mostrar avaliação com spoilers</button>:<><p className={!expanded&&text.length>240?'cr-copy-clamp':''}>{text || 'Registrou sua nota sem deixar um comentário.'}</p>{text.length>240&&<button className="cr-text-action" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?'Ler menos':'Ler avaliação completa'}</button>}</>}</div>
      <div className="cr-card-footer"><LikeButton reviewUser={review.user_id} itemKey={review.item_key} likes={review.likes} liked={review.liked} unavailable={review.reactionUnavailable}/><time dateTime={review.updated_at}>{new Date(review.updated_at).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}</time><Link href={`/filme/${movie.id}?tab=reviews`}>Conversar sobre o filme <Icon name="arrow-up-right"/></Link></div>
    </div>
  </article>;
}

function FeedSkeleton(){return <div className="cr-grid" role="status" aria-label="Carregando avaliações">{Array.from({length:6},(_,i)=><div key={i} className="cr-skeleton m-skeleton"/>)}</div>;}

export default function MovieReviewsFeed() {
  const {client,user}=useAccount();
  const [input,setInput]=useState(''),[filter,setFilter]=useState({query:'',page:0}),[anchor,setAnchor]=useState(()=>new Date().toISOString()),[attempt,setAttempt]=useState(0),[state,setState]=useState({});
  const [audience,setAudience]=useState('community');
  const needsLogin=audience==='friends'&&!user;
  const key=JSON.stringify([user?.id || 'guest',audience,filter,anchor,attempt]);
  useEffect(()=>{const timer=setTimeout(()=>{const query=reviewSearch(input);setFilter(old=>old.query===query?old:{query,page:0});},SEARCH_DELAY_MS);return()=>clearTimeout(timer);},[input]);
  useEffect(()=>{
    const controller=new AbortController();
    if(needsLogin){setState({key,rows:[],total:0});return()=>controller.abort();}
    setState({key,loading:true});
    loadCommunityReviews(client,{...filter,audience,now:anchor,signal:controller.signal})
      .then(data=>{if(!controller.signal.aborted)setState({key,...data});})
      .catch(()=>{if(!controller.signal.aborted)setState({key,error:true});});
    return()=>controller.abort();
  },[client,key]);
  useEffect(()=>{
    if(audience!=='friends')return;
    const refresh=()=>{setFilter(old=>({...old,page:0}));setAttempt(n=>n+1);};
    window.addEventListener(CONNECTIONS_EVENT,refresh);
    return()=>window.removeEventListener(CONNECTIONS_EVENT,refresh);
  },[audience]);
  const feed=state.key===key?state:{loading:true};
  const artMovies=Array.from(new Map((feed.rows || []).map(review=>[review.item_key,review.movie])).values()).slice(0,3);
  const pages=Math.max(1,Math.ceil((feed.total || 0)/COMMUNITY_PAGE_SIZE));
  function clear(){setInput('');setFilter({query:'',page:0});}
  function changeAudience(next){setAudience(next);setFilter(old=>({...old,page:0}));}
  function paginate(page){setFilter(old=>({...old,page}));document.getElementById('cr-results')?.scrollIntoView({block:'start'});}
  return <div className="movies-page community-page"><Head><title>Avaliações da comunidade — VOID</title><meta name="description" content="Leia as avaliações de filmes da comunidade Void nos últimos 30 dias. Descubra opiniões, encontre pessoas e busque reviews por filme."/></Head>
    <MovieHeader current="avaliacoes"/>
    <main><section className="cr-hero"><div className="cr-container cr-hero-inner"><div><p className="m-eyebrow">A COMUNIDADE DEIXOU SUA MARCA</p><h1>Um filme.<br/>Mil <em>pontos de vista.</em></h1><p className="cr-intro">Descubra o que ficou depois dos créditos. Opiniões, descobertas e novas conversas sobre cinema.</p><span className="cr-period"><Icon name="clock"/> Últimos 30 dias</span></div><div className="cr-hero-art" aria-hidden="true">{artMovies.map((movie,i)=><div className={`cr-art-poster cr-art-${i}`} key={movie.id}><MovieImage movie={movie}/></div>)}<span className="cr-art-orbit"/></div></div></section>
      <section className="cr-container cr-feed" id="cr-results" aria-labelledby="cr-heading">
      <FeedAudienceSwitch className="cr-view-switch" audience={audience} onChange={changeAudience}/>
      <div className="cr-toolbar"><div><p className="m-eyebrow">{audience==='friends'?'SEU CÍRCULO NO VOID':'VOZES DO VOID'}</p><h2 id="cr-heading">{audience==='friends'?'Avaliações dos amigos':'Avaliações da comunidade'}</h2><p className="cr-count" role="status" aria-live="polite">{needsLogin?'Entre para ver as avaliações dos seus amigos.':feed.loading?'Buscando avaliações…':feed.error?'Avaliações indisponíveis no momento.':`${feed.total} ${feed.total===1?'avaliação encontrada':'avaliações encontradas'}${filter.query?` para “${filter.query}”`:''} · mais recentes primeiro`}</p></div><div className="cr-tools"><label className="cr-search"><span>Pesquisar por filme</span><div><Icon name="search"/><input type="search" maxLength={100} placeholder="Qual filme você procura?" value={input} onChange={event=>setInput(event.target.value)}/>{input&&<button type="button" aria-label="Limpar pesquisa" onClick={clear}><Icon name="close"/></button>}</div></label><button className="cr-refresh" disabled={feed.loading||needsLogin} aria-label="Atualizar avaliações" title="Atualizar avaliações" onClick={()=>{setFilter(old=>({...old,page:0}));setAnchor(new Date().toISOString());}}><Icon name="refresh"/></button></div></div>
      {needsLogin?<div className="cr-empty cr-friends-empty"><Icon name="lock"/><h3>Seu círculo tem lugar aqui.</h3><p>Entre na sua conta para acompanhar as avaliações públicas dos seus amigos.</p><Link href="/conta?next=%2Favaliacoes">Entrar no VOID <Icon name="arrow-right"/></Link></div>:feed.loading?<FeedSkeleton/>:feed.error?<div className="cr-empty" role="alert"><Icon name="refresh"/><h3>As opiniões voltam já.</h3><p>Não foi possível carregar as avaliações. Confira sua conexão e tente novamente.</p><button onClick={()=>setAttempt(n=>n+1)}>Tentar novamente</button></div>:!feed.rows?.length?<div className={`cr-empty${audience==='friends'?' cr-friends-empty':''}`}><Icon name={audience==='friends'?'users':'film'}/><h3>{filter.query?'Nenhuma avaliação para esse filme.':audience==='friends'?'Novas conversas vêm aí.':'Toda conversa começa com uma opinião.'}</h3><p>{filter.query?`Tente outro título. A busca considera as avaliações públicas ${audience==='friends'?'dos seus amigos ':''}dos últimos 30 dias.`:audience==='friends'?'Seus amigos ainda não publicaram avaliações por aqui. Mostramos as avaliações públicas dos últimos 30 dias.':'Ainda não há avaliações públicas de filmes neste período. Explore o catálogo e compartilhe a sua.'}</p>{filter.query?<button onClick={clear}>Limpar pesquisa</button>:<Link href={audience==='friends'?'/amigos':'/filmes'}>{audience==='friends'?'Ver meus amigos':'Explorar filmes'} <Icon name="arrow-right"/></Link>}</div>:<><div className="cr-grid">{feed.rows.map(review=><CommunityCard key={review.user_id+review.item_key} review={review}/>)}</div><nav className="cr-pagination" aria-label="Páginas de avaliações"><button disabled={filter.page===0} onClick={()=>paginate(filter.page-1)}><Icon name="arrow-left"/> Anterior</button><span>Página {filter.page+1} de {pages}</span><button disabled={filter.page+1>=pages} onClick={()=>paginate(filter.page+1)}>Próxima <Icon name="arrow-right"/></button></nav></>}
      <p className="cr-privacy"><Icon name="user"/> Apenas avaliações publicadas. A visibilidade de cada perfil continua protegida.</p></section>
    </main><footer className="m-footer cr-container"><div><Link className="logo" href="/">void<span><Icon name="dot"/></span></Link><p>Cada opinião abre um novo universo.</p></div><div><Link href="/filmes">Explorar filmes</Link><Link href="/universos">Universos</Link></div><div className="m-tmdb"><a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">Dados de filmes: TMDB</a><p>Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.</p></div></footer>
  </div>;
}
