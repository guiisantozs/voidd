import { getImageProps } from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../Icon';

const labels = { filmes: 'Filmes', series: 'Séries', jogos: 'Jogos', animes: 'Animes' };
const doomsday = {
  highlightKey: 'doomsday', categoria: 'filmes', titulo: 'Vingadores: Doutor Destino',
  backdrop: '/images/home/avengers-doomsday.png', localArtwork: true, rotated: true, imageWidth: 3680, imageHeight: 6540,
  logo: '/images/home/avengers-doomsday-logo.png',
  secondary: { href: '/universos/marvel-mcu', label: 'Universo Marvel' },
};
const cyberpunk = {
  highlightKey: 'cyberpunk', categoria: 'animes', titulo: 'Cyberpunk: Edgerunners',
  backdrop: '/images/home/cyberpunk-edgerunners-hq.png', localArtwork: true, imageWidth: 5995, imageHeight: 3375,
  logo: '/images/home/cyberpunk-logo.png',
  logoFrame: { aspectRatio: '1130 / 335', '--logo-width': '110.9735%', '--logo-left': '-6.1947%', '--logo-top': '-140.2985%' },
};
const gta = {
  highlightKey: 'gta-vi', categoria: 'jogos', titulo: 'Grand Theft Auto VI',
  backdrop: '/images/home/gta-vi-hq.png', localArtwork: true, rotated: true, imageWidth: 3680, imageHeight: 6540,
  logo: '/images/games/gta-vi-logo-white-transparent.png', logoWidth: 1536, logoHeight: 1024,
  logoFrame: { aspectRatio: '1249 / 891', '--logo-width': '122.97838%', '--logo-left': '-9.60769%', '--logo-top': '-12.34568%' },
  description: 'Explore jogos, registre suas avaliações e encontre seu próximo favorito.',
  primary: { href: '/jogos', label: 'Explorar jogos' },
  secondary: { href: '/jogos/biblioteca', label: 'Minha biblioteca' },
};
const lupin = {
  highlightKey: 'lupin', categoria: 'series', titulo: 'Lupin',
  backdrop: '/images/home/lupin-hq.png', localArtwork: true, imageWidth: 10240, imageHeight: 5760,
  logo: '/images/home/lupin-logo.png', logoWidth: 1672, logoHeight: 941,
  logoFrame: { aspectRatio: '1060 / 350', '--logo-width': '157.73585%', '--logo-left': '-29.24528%', '--logo-top': '-88.57143%' },
  // Release date confirmed by Netflix Tudum on 23 October 2026:
  // https://www.netflix.com/tudum/pt-br/artigos/lupin-parte-4-data-de-estreia-fotos-noticias
  description: 'A quarta temporada estreia em 23 de outubro de 2026 na Netflix.',
};
const slides = [doomsday, cyberpunk, gta, lupin];
const SLIDE_DURATION = 10000;
function HighlightIdentity({ item }) {
  const [failed, setFailed] = useState(false);
  if (failed) return item.titulo;
  return <span className="void-home-hero-logo-frame" style={item.logoFrame}><img src={item.logo} alt={item.titulo} width={item.logoWidth || 1254} height={item.logoHeight || 1254} decoding="async" onError={() => setFailed(true)}/></span>;
}
function Backdrop({ item, active, priority, onSettled }) {
  const image = useRef(null), alive = useRef(true), decoding = useRef(false);
  const [ready, setReady] = useState(false);
  const finish = useCallback(async element => {
    if (decoding.current) return;
    decoding.current = true;
    try {
      await element.decode();
      if (alive.current) { setReady(true); onSettled(item.highlightKey, 'ready'); }
    } catch {
      if (alive.current) onSettled(item.highlightKey, 'failed');
    } finally { decoding.current = false; }
  }, [item.highlightKey, onSettled]);
  useEffect(() => {
    alive.current = true;
    onSettled(item.highlightKey, 'loading');
    if (image.current?.complete && image.current.naturalWidth) finish(image.current);
    return () => { alive.current = false; };
  }, [finish, item.highlightKey, onSettled]);
  // Match the pixels needed by object-fit:cover, including portrait screens and
  // the two sideways source images. Next serves cached, high-quality variants.
  const { props } = getImageProps({
    src: item.backdrop, width: item.imageWidth, height: item.imageHeight, quality: 90,
    sizes: item.rotated ? '(min-aspect-ratio: 16/9) 56.3vw, 100vh' : '(max-aspect-ratio: 16/9) 177.8vh, 100vw',
    alt: '', loading: 'eager', decoding: 'async',
  });
  return <div className={`void-home-hero-backdrop${active && ready ? ' is-visible' : ''}${item.rotated ? ' is-rotated-art' : ''}${item.highlightKey === 'cyberpunk' ? ' is-cyberpunk-art' : ''}`} aria-hidden="true">
    <img {...props} ref={image} fetchPriority={priority ? 'high' : 'low'} onLoad={event => finish(event.currentTarget)} onError={() => onSettled(item.highlightKey, 'failed')}/>
  </div>;
}
export default function HomeHero() {
  const [selected, setSelected] = useState('doomsday');
  const [requested, setRequested] = useState(null), [previous, setPrevious] = useState(null);
  const [leaving, setLeaving] = useState(false), [assets, setAssets] = useState({}), [attempts, setAttempts] = useState({});
  const [paused, setPaused] = useState(false), [reducedMotion, setReducedMotion] = useState(true);
  const [hidden, setHidden] = useState(false), [inView, setInView] = useState(true), [actionFocused, setActionFocused] = useState(false);
  const [cycle, setCycle] = useState(0), [loadError, setLoadError] = useState(null);
  const root = useRef(null);
  const active = Math.max(0, slides.findIndex(item => item.highlightKey === selected));
  const current = slides[active], next = slides[(active + 1) % slides.length];
  const onSettled = useCallback((key, status) => setAssets(value => value[key] === status ? value : { ...value, [key]: status }), []);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => setReducedMotion(media.matches), visibility = () => setHidden(document.hidden);
    motion(); visibility();
    media.addEventListener('change', motion); document.addEventListener('visibilitychange', visibility);
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio > .25), { threshold: [0, .25] }) : null;
    if (root.current) observer?.observe(root.current);
    return () => { media.removeEventListener('change', motion); document.removeEventListener('visibilitychange', visibility); observer?.disconnect(); };
  }, []);
  const requestedStatus = requested && assets[requested];
  useEffect(() => {
    if (!requested) return;
    if (requestedStatus === 'failed') { setLoadError(requested); setRequested(null); setLeaving(false); return; }
    if (requestedStatus !== 'ready') return;
    setLeaving(!reducedMotion);
    const timer = setTimeout(() => {
      setPrevious(selected); setSelected(requested); setRequested(null); setLeaving(false);
    }, reducedMotion ? 0 : 180);
    return () => clearTimeout(timer);
  }, [requested, requestedStatus, selected, reducedMotion]);
  useEffect(() => {
    if (!previous) return;
    const timer = setTimeout(() => setPrevious(null), reducedMotion ? 0 : 750);
    return () => clearTimeout(timer);
  }, [previous, reducedMotion]);
  // Only the current image, its successor and a fading/pending image are mounted.
  // Decode the successor (and warm its logo) before the user needs it.
  useEffect(() => {
    const logo = new window.Image(); logo.decoding = 'async'; logo.src = next.logo;
    logo.decode().catch(() => {});
  }, [next.logo]);
  const automatic = !paused && !reducedMotion && !hidden && inView && !actionFocused;
  useEffect(() => {
    if (!automatic || requested || assets[selected] !== 'ready') return;
    const timer = setTimeout(() => { setLoadError(null); setRequested(next.highlightKey); }, SLIDE_DURATION);
    return () => clearTimeout(timer);
  }, [automatic, requested, selected, assets[selected], next.highlightKey, cycle]);
  function selectHighlight(key) {
    if (assets[key] === 'failed') {
      setAssets(value => ({ ...value, [key]: undefined }));
      setAttempts(value => ({ ...value, [key]: (value[key] || 0) + 1 }));
    }
    setLoadError(null); setLeaving(false); setCycle(value => value + 1);
    setRequested(key === selected ? null : key);
  }
  function move(step) {
    const index = requested ? slides.findIndex(item => item.highlightKey === requested) : active;
    selectHighlight(slides[(index + step + slides.length) % slides.length].highlightKey);
  }
  function keyboard(event) {
    if (event.target.closest('a,button,input') || event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1);
  }
  const rendered = new Set([selected, next.highlightKey, requested, previous]);
  const failedKey = loadError || (assets[selected] === 'failed' ? selected : null);
  return <section ref={root} className={`void-home-hero has-artwork is-${current.highlightKey}${leaving ? ' is-leaving' : ''}`} tabIndex={0} aria-label="Histórias em destaque" aria-roledescription="carrossel" onKeyDown={keyboard}
    onFocusCapture={event => setActionFocused(Boolean(event.target.closest('.void-home-hero-actions')))} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setActionFocused(false); }}>
    <div className="void-home-hero-images" aria-hidden="true">{slides.filter(item => rendered.has(item.highlightKey)).map(item => <Backdrop key={`${item.highlightKey}:${attempts[item.highlightKey] || 0}`} item={item} active={item.highlightKey === selected} priority={item.highlightKey === selected || item.highlightKey === requested} onSettled={onSettled}/>)}</div>
    <div className="void-home-hero-shade" aria-hidden="true"/>
    <div className="void-home-hero-inner"><div className="void-home-hero-copy" key={current.highlightKey}>
      <p className="void-home-hero-eyebrow">DESTAQUE VOID <span/>{labels[current.categoria]}</p>
      {current.highlightKey === 'doomsday' && <h1>Toda história<br/>deixa uma <em>marca.</em></h1>}
      <div className="void-home-hero-selection" aria-live={automatic ? 'off' : 'polite'} aria-atomic="true"><h2><HighlightIdentity key={current.highlightKey} item={current}/></h2><p className="void-home-hero-feature-name">{current.titulo}</p></div>
      <p className="void-home-hero-description">{current.description || 'O filme que te mudou. O jogo que não sai da cabeça. Guarde tudo no seu universo.'}</p>
      <div className="void-home-hero-actions"><Link className="void-home-hero-cta" href={current.primary?.href || '#catalogo'}>{current.primary?.label || 'Explorar catálogo'} <Icon name="arrow-up-right"/></Link>{current.secondary && <Link className="void-home-hero-secondary" href={current.secondary.href}>{current.secondary.label} <Icon name="arrow-up-right"/></Link>}</div>
      {failedKey && <p className="void-home-hero-load-error" role="status">Não foi possível carregar a imagem do destaque. <button type="button" onClick={() => selectHighlight(failedKey)}>Tentar novamente</button></p>}
    </div></div>
    {slides.length > 1 && <div className="void-home-hero-navigation">
      <div className="void-home-hero-dots" role="group" aria-label="Escolher destaque">{slides.map((item, index) => <button key={item.highlightKey} type="button" onClick={() => selectHighlight(item.highlightKey)} aria-label={`Mostrar ${item.titulo}`} aria-pressed={index === active}><span/></button>)}</div>
      <span className="void-home-hero-count" aria-hidden="true">{String(active + 1).padStart(2, '0')}<small> / {String(slides.length).padStart(2, '0')}</small></span>
      <div className="void-home-hero-controls"><button type="button" aria-label="Destaque anterior" onClick={() => move(-1)}><Icon name="arrow-left"/></button><button type="button" disabled={reducedMotion} aria-label={reducedMotion ? 'Troca automática desativada por preferência de movimento reduzido' : paused ? 'Retomar troca automática' : 'Pausar troca automática'} aria-pressed={paused || reducedMotion} onClick={() => setPaused(value => !value)}><Icon name={paused || reducedMotion ? 'play' : 'pause'}/></button><button type="button" aria-label="Próximo destaque" onClick={() => move(1)}><Icon name="arrow-right"/></button></div>
    </div>}
  </section>;
}
