import Icon from '../Icon';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import {useVisibleSection} from '../../lib/use-visible-section';
import { MovieCard, MovieFailure, PosterSkeletons } from './MovieUI';

export default function PosterRow({ title, icon = 'sparkle', sectionKey, state, retry, upcoming = false, now, empty, intro, renderCard, skeleton, className = '', media = 'filmes', href, onVisible }) {
  const track = useRef(null);
  const [sectionRef, visible] = useVisibleSection(!!onVisible);
  const notify = useRef(onVisible); notify.current = onVisible;
  useEffect(() => { if (visible) notify.current?.(); }, [visible]);
  function move(direction) { track.current?.scrollBy({ left: direction * track.current.clientWidth * .8, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }
  const id=`${media==='animes'?'animes':media==='series'?'series':'movie'}-${sectionKey}`;
  return <section ref={sectionRef} className={`m-poster-section ${className}`} aria-labelledby={id}><div className="m-section-title"><span aria-hidden="true"><Icon name={icon} /></span><h2 id={id}>{title}</h2><span className="m-section-line" />{href&&<Link className="m-see-all" href={href}>Ver tudo <Icon name="arrow-up-right"/></Link>}</div>{intro}{!state || state.loading ? (skeleton || <PosterSkeletons label={media==='animes'?'Carregando animes':media==='series'?'Carregando séries':'Carregando filmes'}/>) : state.error ? <MovieFailure message={state.error} retry={retry} /> : !state.movies?.length ? (empty || <p className="m-empty">Não há {media==='animes'?'animes':media==='series'?'séries':'filmes'} nesta seleção no momento.</p>) : <div className="m-row-container"><button type="button" className="m-row-arrow m-row-prev" onClick={() => move(-1)} aria-label={`Rolar ${title} para a esquerda`}><Icon name="chevron-left" /></button><div className="m-poster-track" ref={track} tabIndex={0} role="region" aria-label={title}>{state.movies.map(movie => renderCard ? renderCard(movie) : <MovieCard key={movie.id} movie={movie} upcoming={upcoming} now={now} />)}</div><button type="button" className="m-row-arrow m-row-next" onClick={() => move(1)} aria-label={`Rolar ${title} para a direita`}><Icon name="chevron-right" /></button></div>}</section>;
}
