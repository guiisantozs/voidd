import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../Icon';
import { GameImage, rememberGame } from '../GameUI';
import { MovieFailure } from '../movies/MovieUI';
import { workHref } from '../../lib/work-client';
import { useMotionPreferences } from '../../lib/use-motion-preferences';

// Animation settings: milliseconds. No additional animation library.
export const SLIDE_DURATION = 6000;
export const SLIDE_TRANSITION = 700;
const SWIPE_DISTANCE = 45;
const relativePosition = (position, active, count) => {
  const delta = (position - active + count) % count;
  return delta > count / 2 ? delta - count : delta;
};

export default function GameSpotlight({ state, retry }) {
  const games = (state?.games || []).slice(0, 5);
  const [active, setActive] = useState(0), [cycle, setCycle] = useState(0);
  const [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false);
  const [paused, setPaused] = useState(false), [dragging, setDragging] = useState(false);
  const progress = useRef(null), elapsed = useRef(0), pointer = useRef(null), suppressClick = useRef(false);
  const { reduced, hidden } = useMotionPreferences();
  const index = games.length ? active % games.length : 0;
  const previousIndex = useRef(index);
  useEffect(() => { previousIndex.current = index; }, [index]);
  const stopped = paused || hovered || focused || dragging || hidden || reduced;
  const move = useCallback(step => {
    if (games.length < 2) return;
    elapsed.current = 0;
    setActive(value => (value + step + games.length) % games.length);
    setCycle(value => value + 1);
  }, [games.length]);
  function select(next) {
    elapsed.current = 0; setActive(next); setCycle(value => value + 1);
  }
  useEffect(() => {
    const next = games[(index + 1) % games.length];
    if (!next) return;
    const image = new Image(); image.src = next.backdrop || next.poster || '';
  }, [index, games.map(game => game.backdrop || game.poster).join('|')]);
  useEffect(() => {
    if (!progress.current) return;
    progress.current.style.transform = `scaleX(${elapsed.current / SLIDE_DURATION})`;
    if (stopped || games.length < 2 || state?.loading || state?.error) return;
    let frame, previous;
    const tick = time => {
      if (previous !== undefined) elapsed.current += Math.min(time - previous, 100);
      previous = time;
      if (elapsed.current >= SLIDE_DURATION) { move(1); return; }
      if (progress.current) progress.current.style.transform = `scaleX(${elapsed.current / SLIDE_DURATION})`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [stopped, index, cycle, games.length, move, state?.loading, state?.error]);
  function finishPointer(event) {
    const start = pointer.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy)) {
      suppressClick.current = true; move(dx < 0 ? 1 : -1);
    }
    pointer.current = null; setDragging(false);
  }
  return <section className="game-feature" aria-labelledby="game-weekly" aria-roledescription="carrossel"
    style={{ '--spotlight-duration': `${SLIDE_DURATION}ms`, '--spotlight-transition': `${SLIDE_TRANSITION}ms` }}
    onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(true); }}
    onPointerLeave={event => { if (event.pointerType === 'mouse') setHovered(false); }}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); } }}>
    <div className="m-section-title m-container"><span aria-hidden="true"><Icon name="diamond"/></span><h2 id="game-weekly">Em destaque</h2><span className="m-section-line"/></div>
    <p className="game-weekly-basis m-container">Uma seleção diária de jogos relevantes, diferente dos banners principais.</p>
    {state?.notice&&<p className="game-weekly-basis m-container" role="status">{state.notice}</p>}
    {!state || state.loading ? <div className="m-weekly-skeleton m-skeleton" role="status" aria-label="Carregando jogos em destaque"/> : state.error ? <div className="m-container"><MovieFailure message={state.error} retry={retry}/></div> : !games.length ? <p className="m-empty m-container">Nenhum destaque disponível.</p> : <>
      <div className="game-feature-stage" tabIndex={0} role="region" aria-label="Jogos em destaque; use as setas para navegar"
        onDragStart={event => event.preventDefault()}
        onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}
        onPointerDown={event => { if (!event.isPrimary || event.button !== 0) return; suppressClick.current = false; pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY }; setDragging(true); }}
        onPointerMove={event => { const start = pointer.current; if (start && Math.abs(event.clientX - start.x) > 10 && Math.abs(event.clientX - start.x) > Math.abs(event.clientY - start.y)) event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerUp={finishPointer} onPointerCancel={() => { pointer.current = null; setDragging(false); }} onLostPointerCapture={() => { pointer.current = null; setDragging(false); }}>
        {games.map((game, i) => {
          const position = relativePosition(i, index, games.length), selected = i === index;
          const recycled = !selected && Math.abs(relativePosition(i, previousIndex.current, games.length) - position) > 1;
          return <article key={game.id} className={`game-feature-card${selected ? ' is-active' : ''}${Math.abs(position) > 1 ? ' is-distant' : ''}${recycled ? ' is-recycled' : ''}`} style={{ '--slide-position': position }} aria-hidden={!selected} inert={!selected ? '' : undefined} aria-roledescription="slide" aria-label={`${i + 1} de ${games.length}: ${game.titulo}`}>
            <div key={selected ? `image-${cycle}` : 'idle'} className="game-feature-image" style={{ animationPlayState: stopped ? 'paused' : 'running' }}><GameImage src={game.backdrop || game.poster} alt={`Arte de ${game.titulo}`} loading={selected ? 'eager' : 'lazy'}/></div>
            <div className="game-feature-shade"/>
            <div key={selected ? `copy-${cycle}` : 'idle'} className="game-feature-copy"><p className="m-eyebrow">SELEÇÃO DO DIA</p><h3>{game.titulo}</h3><p className="game-feature-meta">{[game.generos?.slice(0, 2).join(' / '), game.plataformas?.join(' · ')].filter(Boolean).join(' — ') || game.sinopse || 'Explore este jogo no VOID.'}</p><Link className="m-button" href={workHref(game)} onClick={() => rememberGame(game)}>Ver detalhes <Icon name="arrow-up-right"/></Link></div>
          </article>;
        })}
      </div>
      {games.length > 1 && <div className="game-feature-controls"><div className="game-feature-dots" aria-label="Selecionar destaque">{games.map((game, i) => <button key={game.id} className={i === index ? 'is-active' : ''} aria-label={`Mostrar ${game.titulo}`} aria-current={i === index ? 'true' : undefined} onClick={() => select(i)}><span className="game-feature-progress" key={i === index ? cycle : 'idle'} ref={i === index ? progress : null}/></button>)}</div><div className="game-feature-navigation"><button aria-label="Jogo em destaque anterior" onClick={() => move(-1)}><Icon name="arrow-left"/></button><button aria-label={paused ? 'Retomar destaques' : 'Pausar destaques'} aria-pressed={paused} onClick={() => setPaused(value => !value)}><Icon name={paused ? 'play' : 'pause'}/></button><span aria-live="off">{index + 1}/{games.length}</span><button aria-label="Próximo jogo em destaque" onClick={() => move(1)}><Icon name="arrow-right"/></button></div></div>}
    </>}
  </section>;
}
