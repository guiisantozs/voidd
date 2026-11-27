import {animeDisplayTitle} from '../../lib/anime-titles';
import { GameImage, rememberGame } from '../GameUI';
import { workHref } from '../../lib/work-client';
import Icon from '../Icon';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { movieHref } from '../../lib/movie-sections';
import { MovieFailure, MovieImage, rememberMovie } from './MovieUI';
import GameSpotlight from '../games/GameSpotlight';

export default function WeeklyFeature({ state, retry, media = 'filmes' }) {
  if (media === 'jogos') return <GameSpotlight state={state} retry={retry}/>;
  return <MovieWeeklyFeature state={state} retry={retry} media={media}/>;
}

function MovieWeeklyFeature({ state, retry, media }) {
  const gamesMode = media === 'jogos';
  const weeklyId = gamesMode ? 'game-weekly' : media==='series'?'series-weekly':'movie-weekly';
  const title = gamesMode ? 'Em destaque' : ['series','animes'].includes(media)?'Destaques da Semana':'Destaque da semana';
  const href = gamesMode ? workHref : movieHref;
  const remember = gamesMode ? rememberGame : rememberMovie;
  const track = useRef(null);
  const [index, setIndex] = useState(0);
  const current = useRef(0);
  const scrollEnd = useRef(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [paused, setPaused] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const [touching, setTouching] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const movies = ((gamesMode ? state?.games : state?.movies) || []).slice(0, media==='animes'?10:5);
  const move = useCallback(step => {
    if (!movies.length) return;
    const next = (current.current + step + movies.length) % movies.length;
    const card = track.current?.children[next];
    if (card) track.current.scrollTo({ left: card.offsetLeft - track.current.clientWidth / 2 + card.clientWidth / 2, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    current.current = next;
    setIndex(next);
  }, [movies.length]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => setReducedMotion(media.matches);
    const visibility = () => setHidden(document.hidden);
    motion(); visibility();
    media.addEventListener('change', motion); document.addEventListener('visibilitychange', visibility);
    return () => { media.removeEventListener('change', motion); document.removeEventListener('visibilitychange', visibility); clearTimeout(scrollEnd.current); };
  }, []);
  useEffect(() => {
    if (movies.length < 2 || state?.loading || state?.error || hovered || focused || paused || scrolling || touching || hidden || reducedMotion) return;
    const timer = setTimeout(() => move(1), 3500);
    return () => clearTimeout(timer);
  }, [movies.length, state?.loading, state?.error, index, move, hovered, focused, paused, scrolling, touching, hidden, reducedMotion]);
  function settleScroll() {
    if (!track.current) { setScrolling(false); return; }
    const center = track.current.scrollLeft + track.current.clientWidth / 2;
    const distances = [...track.current.children].map(child => Math.abs(child.offsetLeft + child.clientWidth / 2 - center));
    current.current = distances.indexOf(Math.min(...distances));
    setIndex(current.current);
    setScrolling(false);
  }
  return <section className={`m-weekly ${gamesMode ? 'game-weekly' : ''}`} aria-labelledby={weeklyId} aria-roledescription="carrossel" onPointerEnter={event => { if(event.pointerType==='mouse')setHovered(true); }} onPointerLeave={event => { if(event.pointerType==='mouse')setHovered(false); }} onFocusCapture={event => setFocused(event.target.matches(':focus-visible'))} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}><div className="m-section-title m-container"><span aria-hidden="true"><Icon name="diamond" /></span><h2 id={weeklyId}>{title}</h2><span className="m-section-line" /></div>{media==='animes'&&state?.discoveryNote&&<p className="series-row-note m-container">{state.discoveryNote}</p>}{gamesMode && <p className="game-weekly-basis m-container">Popularidade no RAWG entre lançamentos recentes e próximos.</p>}{!state || state.loading ? <div className="m-weekly-skeleton m-skeleton" role="status" aria-label={gamesMode ? 'Carregando jogos em destaque' : 'Carregando destaque da semana'} /> : state.error ? <div className="m-container"><MovieFailure message={state.error} retry={retry} /></div> : !movies.length ? <p className="m-empty m-container">Nenhum destaque disponível.</p> : <><div className="m-peek-track" ref={track} tabIndex={0} role="region" aria-label={gamesMode ? 'Jogos em destaque' : 'Destaques da semana'} onPointerDown={event => { if (event.pointerType !== 'mouse') setTouching(true); }} onPointerUp={() => setTouching(false)} onPointerCancel={() => setTouching(false)} onLostPointerCapture={() => setTouching(false)} onScroll={() => { setScrolling(true); clearTimeout(scrollEnd.current); scrollEnd.current = setTimeout(settleScroll, 120); }}>{movies.map((movie, i) => <article className="m-peek-card" key={movie.id} aria-label={`${i + 1} de ${movies.length}: ${movie.titulo}`}>{gamesMode ? <GameImage src={movie.backdrop || movie.poster} alt={`Arte de ${movie.titulo}`} loading="lazy" /> : <MovieImage movie={movie} backdrop />}<div className="m-peek-gradient" /><div className="m-peek-copy"><p className="m-eyebrow">{gamesMode ? 'EM ALTA NO RAWG' : 'SELEÇÃO DA SEMANA'}</p><h3>{media==='animes'?animeDisplayTitle(movie):movie.titulo}</h3><p>{movie.sinopse || `Explore os detalhes deste ${gamesMode ? 'jogo' : media==='animes'?'anime':'filme'} no VOID.`}</p><Link href={href(movie)} className="m-button" onClick={() => remember(movie)}>{"Ver detalhes "}<Icon name="arrow-up-right" /></Link></div></article>)}</div>{movies.length > 1 && <div className="m-peek-controls"><button type="button" aria-label={gamesMode ? 'Jogo em destaque anterior' : 'Destaque semanal anterior'} onClick={() => move(-1)}><Icon name="arrow-left" /></button><button type="button" aria-label={paused ? 'Retomar destaques semanais' : 'Pausar destaques semanais'} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? <Icon name="play" /> : <Icon name="pause" />}</button><span aria-live="off">{index % movies.length + 1} / {movies.length}</span><button type="button" aria-label={gamesMode ? 'Próximo jogo em destaque' : 'Próximo destaque semanal'} onClick={() => move(1)}><Icon name="arrow-right" /></button></div>}</>}</section>;
}
