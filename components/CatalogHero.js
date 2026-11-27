import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { useMotionPreferences } from '../lib/use-motion-preferences';

// Same pacing and entrance animations as the homepage's four highlights.
const SLIDE_DURATION = 10000;
const EXIT_DURATION = 180;
const CROSSFADE_DURATION = 750;

function Backdrop({ item, active, priority, renderImage, onSettled }) {
  const root = useRef(null), alive = useRef(false), decoding = useRef(false);
  const finish = useCallback(async image => {
    if (decoding.current) return;
    decoding.current = true;
    try { await image.decode(); if (alive.current) onSettled(item.id, 'ready'); }
    catch { if (alive.current) onSettled(item.id, 'failed'); }
    finally { decoding.current = false; }
  }, [item.id, onSettled]);
  useEffect(() => {
    alive.current = true;
    onSettled(item.id, 'loading');
    const image = root.current?.querySelector('img');
    if (!image || image.complete && !image.naturalWidth) onSettled(item.id, 'failed');
    else if (image.complete) finish(image);
    return () => { alive.current = false; };
  }, [item.id, finish, onSettled]);
  return <div ref={root} className={`void-home-hero-backdrop${active ? ' is-visible' : ''}${!item.logo?' catalog-art--panorama':''}`} style={{ '--catalog-art-position': item.position || 'center', '--catalog-art-mobile-position': item.mobilePosition || item.position || 'center' }}>
    {renderImage(item, { priority, onLoad: event => finish(event.currentTarget), onError: () => onSettled(item.id, 'failed') })}
  </div>;
}

export default function CatalogHero({ items, label, className = '', renderImage, renderContent }) {
  const [selected, setSelected] = useState(null), [requested, setRequested] = useState(null), [previous, setPrevious] = useState(null);
  const [assets, setAssets] = useState({}), [leaving, setLeaving] = useState(false), [attempt, setAttempt] = useState(0);
  const [retries, setRetries] = useState({});
  const [paused, setPaused] = useState(false), [focused, setFocused] = useState(false), [hovered, setHovered] = useState(false), [touching, setTouching] = useState(false), [inView, setInView] = useState(true);
  const root = useRef(null), pointer = useRef(null), suppressClick = useRef(false);
  const { reduced, hidden } = useMotionPreferences();
  const active = Math.max(0, items.findIndex(item => item.id === selected));
  const current = items[active], next = items[(active + 1) % items.length];
  const onSettled = useCallback((id, status) => setAssets(old => old[id] === status ? old : { ...old, [id]: status }), []);
  const automatic = !paused && !focused && !hovered && !touching && !reduced && !hidden && inView;
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio > .25), { threshold: [0, .25] });
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!current || requested === null || !['ready', 'failed'].includes(assets[requested])) return;
    setLeaving(!reduced);
    const timer = setTimeout(() => { setPrevious(current.id); setSelected(requested); setRequested(null); setLeaving(false); }, reduced ? 0 : EXIT_DURATION);
    return () => clearTimeout(timer);
  }, [requested, assets[requested], current?.id, reduced]);
  useEffect(() => {
    if (previous === null) return;
    const timer = setTimeout(() => setPrevious(null), reduced ? 0 : CROSSFADE_DURATION);
    return () => clearTimeout(timer);
  }, [previous, reduced]);
  useEffect(() => {
    if (!current || !next || items.length < 2 || !automatic || requested !== null || !['ready', 'failed'].includes(assets[current.id])) return;
    const timer = setTimeout(() => setRequested(next.id), SLIDE_DURATION);
    return () => clearTimeout(timer);
  }, [current?.id, next?.id, items.length, automatic, requested, assets[current?.id], attempt]);
  function select(id) { setLeaving(false); setRequested(id === current.id ? null : id); setAttempt(value => value + 1); }
  function move(step) {
    const pending = items.findIndex(item => item.id === requested), start = pending < 0 ? active : pending;
    select(items[(start + step + items.length) % items.length].id);
  }
  function finishPointer(event) {
    const start = pointer.current;
    if (start && start.id === event.pointerId) {
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) && items.length > 1) { suppressClick.current = true; move(dx < 0 ? 1 : -1); }
    }
    pointer.current = null; setTouching(false);
  }
  if (!current) return null;
  const rendered = new Set([current.id, next.id, requested, previous]);
  return <section ref={root} className={`void-home-hero void-catalog-hero ${className}${leaving ? ' is-leaving' : ''}`} tabIndex={0} aria-label={label} aria-roledescription="carrossel"
    onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(true); }} onPointerLeave={event => { if (event.pointerType === 'mouse') setHovered(false); }}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    onKeyDown={event => { if (!event.altKey && !event.ctrlKey && !event.metaKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1); } }}
    onDragStart={event => event.preventDefault()}
    onPointerDown={event => { if (!event.isPrimary || event.button !== 0 || event.target.closest('button')) return; suppressClick.current = false; pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY }; setTouching(true); }}
    onPointerMove={event => { const start = pointer.current; if (start && Math.abs(event.clientX - start.x) > 10 && Math.abs(event.clientX - start.x) > Math.abs(event.clientY - start.y)) event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerUp={finishPointer} onPointerCancel={() => { pointer.current = null; setTouching(false); }} onLostPointerCapture={() => { pointer.current = null; setTouching(false); }}
    onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
    <div className="void-home-hero-images" aria-hidden="true">{items.filter(item => rendered.has(item.id)).map(item => <Backdrop key={`${item.id}:${retries[item.id] || 0}`} item={item} active={item.id === current.id && ['ready', 'failed'].includes(assets[item.id])} priority={item.id === current.id || item.id === requested} renderImage={renderImage} onSettled={onSettled}/>)}</div>
    <div className="void-home-hero-shade" aria-hidden="true"/>
    <div className="void-home-hero-inner"><div className="void-home-hero-copy" key={current.id} aria-live="off">{renderContent(current)}
      {assets[current.id] === 'failed' && <p className="void-home-hero-load-error" role="status">Imagem indisponível. <button type="button" onClick={() => { setAssets(old => ({ ...old, [current.id]: undefined })); setRetries(old => ({ ...old, [current.id]: (old[current.id] || 0) + 1 })); setAttempt(value => value + 1); }}>Tentar novamente</button></p>}
    </div></div>
    {items.length > 1 && <div className="void-home-hero-navigation"><div className="void-home-hero-dots" role="group" aria-label="Escolher destaque">{items.map((item, i) => <button key={item.id} type="button" aria-label={`Mostrar ${item.title}`} aria-pressed={i === active} onClick={() => select(item.id)}><span/></button>)}</div><span className="void-home-hero-count" aria-hidden="true">{String(active + 1).padStart(2, '0')}<small> / {String(items.length).padStart(2, '0')}</small></span><div className="void-home-hero-controls"><button type="button" aria-label="Destaque anterior" onClick={() => move(-1)}><Icon name="arrow-left"/></button><button type="button" disabled={reduced} aria-label={reduced ? 'Troca automática desativada por preferência de movimento reduzido' : paused ? 'Retomar troca automática' : 'Pausar troca automática'} aria-pressed={paused || reduced} onClick={() => setPaused(value => !value)}><Icon name={paused || reduced ? 'play' : 'pause'}/></button><button type="button" aria-label="Próximo destaque" onClick={() => move(1)}><Icon name="arrow-right"/></button></div></div>}
    <p className="sr-only" role="status" aria-live={automatic ? 'off' : 'polite'}>Destaque {active + 1} de {items.length}: {current.title}</p>
  </section>;
}
