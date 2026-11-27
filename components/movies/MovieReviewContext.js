import { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '../Icon';
import Poster from '../Poster';
import { useAccount } from '../AccountProvider';
import { formatRating } from '../../lib/catalog';
import { withIdentities } from '../../lib/usernames';
import { MovieImage } from './MovieUI';
import Cast from './MovieCast';
import { ReviewCard, useMovieReviewSummary } from './MovieReviews';

export function ReviewBackdrop({movie}) {
  const artwork = {...movie, backdrop:movie.backdrop || movie.poster};
  return <div className="vr-backdrop" aria-hidden="true"><MovieImage movie={artwork} backdrop eager/><div/></div>;
}

export function ReviewMovieFacts({movie}) {
  const cast = movie.elenco || movie.creditos || [];
  return <aside className="vr-facts" aria-label="Sobre o filme">
    <Link className="vr-poster-link" href={`/filme/${movie.id}`} aria-label={`Ver detalhes de ${movie.titulo}`}><Poster item={movie}/></Link>
    <section className="panel"><h2><Icon name="list"/> Sobre o filme</h2>
      <div className="vr-metadata">{movie.classificacao&&<span className="md-age">{movie.classificacao}</span>}{movie.duracao&&<span>{movie.duracao} min</span>}{movie.ano&&<span>{movie.ano}</span>}</div>
      {!!movie.generos?.length&&<p className="muted">{movie.generos.join(' · ')}</p>}
      {movie.informacoes?.length?<dl className="md-facts">{movie.informacoes.filter(info=>info.label!=='Duração').slice(0,6).map(info=><div key={info.label}><dt>{info.label}</dt><dd>{info.valor}</dd></div>)}</dl>:<p className="muted">Mais informações ainda não disponíveis.</p>}
    </section>
    <section className="panel"><h2><Icon name="users"/> Elenco</h2>{cast.length?<Cast people={cast.slice(0,6)}/>:<p className="muted">Elenco não informado.</p>}<Link className="vr-detail-link" href={`/filme/${movie.id}`}>Ver ficha completa <Icon name="arrow-up-right"/></Link></section>
  </aside>;
}

export function ReviewCommunity({movie,revision}) {
  const {client,user}=useAccount();
  const [attempt,setAttempt]=useState(0),[state,setState]=useState({loading:true});
  const summary=useMovieReviewSummary(movie.id,`${revision}:${attempt}`);
  const movieKey=`filmes:${movie.id}`;
  useEffect(()=>{
    let active=true;
    setState({loading:true});
    if(!client){setState({error:true});return;}
    client.rpc('void_movie_review_page_v2',{movie_key:movieKey,sort_by:'recent',min_rating:0,max_rating:5,page_offset:0})
      .then(async({data,error})=>{
        if(error||!data)throw error || new Error('Sem resposta');
        const rows=await withIdentities(client,data.reviews.slice(0,3));
        if(active)setState({rows,total:data.total});
      }).catch(()=>{if(active)setState({error:true});});
    return()=>{active=false;};
  },[client,user?.id,movieKey,revision,attempt]);
  const refresh=()=>setAttempt(n=>n+1);
  return <aside className="vr-community" aria-label="Avaliações da comunidade"><section className="panel">
    <p className="eyebrow">OUTRAS MARCAS NESTE FILME</p><h2><Icon name="users"/> A comunidade no Void</h2>
    <div className="vr-community-score" aria-live="polite"><strong>{summary.loading?'…':formatRating(summary.data?.average)}<small> / 5</small></strong><span>Nota Void{summary.data&&<small>{summary.data.total} avaliações públicas</small>}</span></div>
    {(state.error||summary.error)&&<div className="md-section-error" role="status"><p>Não foi possível carregar todas as avaliações.</p><button type="button" onClick={refresh}>Tentar novamente</button></div>}
    {state.loading?<div className="m-skeleton vr-community-loading" role="status" aria-label="Carregando avaliações da comunidade"/>:state.rows?.length?<div className="vr-community-reviews">{state.rows.map(review=><ReviewCard key={review.user_id} review={review} movieKey={movieKey} onChange={refresh}/>)}</div>:!state.error&&<p className="muted">Este filme ainda não tem avaliações públicas. Sua opinião pode ser a primeira.</p>}
    {!!state.rows?.length&&<Link className="vr-detail-link" href={`/filme/${movie.id}?tab=reviews`}>Ver todas as avaliações <Icon name="arrow-up-right"/></Link>}
  </section></aside>;
}
