import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import Icon from '../Icon';
import {useVisibleSection} from '../../lib/use-visible-section';
import {publicCatalog} from '../../lib/public-catalog-client';
import {episodeReviewHref,episodeReleaseLabel,recentEpisode} from '../../lib/episode-releases';

export default function EpisodeHighlights({media='series',endpoint='/api/series/new-episodes'}) {
 const [ref,visible]=useVisibleSection(),track=useRef(null),[state,setState]=useState(null),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  if(!visible)return;const controller=new AbortController();setState({loading:true});
  publicCatalog.request(endpoint,{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setState(data);}).catch(()=>{if(!controller.signal.aborted)setState({error:true});});
  return()=>controller.abort();
 },[visible,endpoint,attempt]);
 const rows=(state?.episodes||[]).filter(row=>row.series?.categoria===media&&recentEpisode(row.episode,{media}));
 const move=direction=>track.current?.scrollBy({left:direction*track.current.clientWidth*.85,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 return <div ref={ref} className="series-episode-anchor">{state?.loading?<div className="series-episode-loading m-skeleton" role="status" aria-label="Carregando novos episódios"/>:state?.error?<p className="series-row-note" role="status">Não foi possível conferir os novos episódios. <button type="button" onClick={()=>setAttempt(value=>value+1)}>Tentar novamente</button></p>:rows.length>0&&<section className="series-episode-highlights" aria-labelledby={`${media}-new-episodes-title`}>
  <div className="m-section-title"><span aria-hidden="true"><Icon name="play"/></span><h2 id={`${media}-new-episodes-title`}>Novos episódios em destaque</h2><span className="m-section-line"/><div className="series-episode-controls"><button type="button" aria-label="Episódios anteriores" onClick={()=>move(-1)}><Icon name="chevron-left"/></button><button type="button" aria-label="Próximos episódios" onClick={()=>move(1)}><Icon name="chevron-right"/></button></div></div>
  <p className="series-row-note">Exibição recente informada por {media==='animes'?'MyAnimeList':'TMDB'}. A disponibilidade varia por região e plataforma.</p>
  <div ref={track} className="series-episode-track" role="region" tabIndex={0} aria-label="Novos episódios em destaque">{rows.map(({series,episode})=><Link className="series-episode-card" key={`${series.id}:${episode.seasonNumber}:${episode.episodeNumber}`} href={episodeReviewHref(media,episode)} aria-label={`Avaliar ${series.titulo}, temporada ${episode.seasonNumber}, episódio ${episode.episodeNumber}`}>
   <div className="series-episode-art">{(episode.still||series.backdrop||series.poster)?<img src={episode.still||series.backdrop||series.poster} alt="" loading="lazy" decoding="async" width="300" height="169"/>:<Icon name="play"/>}<span>Novo episódio</span></div>
   <div className="series-episode-copy"><h3>{series.titulo}</h3><p>{media==='animes'?'Produção':`T${episode.seasonNumber}`} · EP{String(episode.episodeNumber).padStart(2,'0')} <time dateTime={episode.airDate}>{episodeReleaseLabel(episode.airDate)}</time></p>{episode.name&&<small>{episode.name}</small>}<span>Avaliar episódio <Icon name="arrow-up-right"/></span></div>
  </Link>)}</div>
 </section>}</div>;
}
