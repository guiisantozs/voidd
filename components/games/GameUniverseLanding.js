import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import UniverseArtwork from '../universes/UniverseArtwork';
import { useRouter } from 'next/router';
import { createPortal } from 'react-dom';
import Icon from '../Icon';
import UniverseLogo from '../universes/UniverseLogo';
import { UniverseProgress } from '../universes/UniverseUI';
import UniverseHeroMotion from './UniverseHeroMotion';
import UniverseReleaseCountdown from './UniverseReleaseCountdown';
import { useGameOverviewData } from '../../lib/use-game-overview-data';
import { useAvatars } from '../../lib/use-avatars';
import AvatarPicker from '../avatars/AvatarPicker';
import GameMedia from './GameMedia';
import DetailModal from '../movies/DetailModal';
import { gameUniverseLandings } from '../../config/game-universe-landings';
import { activeUniverseSection } from '../../lib/universe-navigation';

const MEDIA_PARTS = ['screenshots', 'trailer'];
const HeroImage = UniverseArtwork;

export default function GameUniverseLanding({ universe, data, view, children, otherUniverses }) {
  const router = useRouter();
  const config = gameUniverseLandings[universe.slug];
  const root = useRef(null), restored = useRef(false), [active, setActive] = useState('inicio'), [trailerOpen, setTrailerOpen] = useState(false);
  const sectionNav = useRef(null);
  const [failed, setFailed] = useState([]), [accent, setAccent] = useState(config.accent||universe.accent);
  const media = useGameOverviewData(config.mediaGame, { parts: MEDIA_PARTS });
  const avatars = useAvatars('jogos');
  const universeIds = useMemo(() => new Set(Object.values(universe.rawgIds).map(String)), [universe]);
  const catalog = { ...avatars, rows: avatars.rows.filter(row => row.media_type === 'jogos' && universeIds.has(String(row.media_id))) };
  const sections = useMemo(() => [
    ['inicio', 'Início'], ['sobre', 'Sobre'], ['jogos', 'Jogos'],
    ...(view.groups.some(group => group.key === 'remasters') ? [['gu-remasters', 'Edições']] : []),
    ['midia', 'Mídia'], ...(catalog.rows.length ? [['avatares', 'Avatares']] : []), ['outros-universos', 'Outros universos'],
  ], [view.groups.some(group => group.key === 'remasters'), catalog.rows.length]);
  const sources = [...new Set([config.hero, data?.backdrop, data?.games?.[0]?.backdrop, data?.games?.[0]?.officialCover?.url].filter(Boolean))];
  const source = sources.find(value => !failed.includes(value));
  const mediaItem = { ...config.mediaGame, screenshots: media.state.screenshots?.data || [], trailer: media.state.trailer?.data || null };
  const count = data?.total;

  function scrollToSection(id, behavior = 'instant') {
    const target = document.getElementById(id);
    if (!target) return;
    const offset = (sectionNav.current?.getBoundingClientRect().height || 64) + 16;
    const menuStart = (root.current?.querySelector('.gu-hero-motion')?.getBoundingClientRect().bottom || 0) + window.scrollY;
    const destination = target.getBoundingClientRect().top + window.scrollY;
    // Avoid stacking the global scroll-padding with the universe scroll margin.
    // About begins immediately after the menu, so never stop before it sticks.
    window.scrollTo({ top: id === 'inicio' ? destination : Math.max(menuStart, destination - offset), behavior });
  }

  useEffect(() => {
    const id = location.hash.slice(1);
    if (restored.current) return;
    if (!id) { restored.current = true; return; }
    const target = document.getElementById(id);
    if (!target) return;
    const frame = requestAnimationFrame(() => { restored.current = true; scrollToSection(id); });
    return () => cancelAnimationFrame(frame);
  }, [sections]);
  useEffect(() => {
    let frame;
    const restore = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => scrollToSection(location.hash.slice(1))); };
    window.addEventListener('popstate', restore); window.addEventListener('hashchange', restore);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('popstate', restore); window.removeEventListener('hashchange', restore); };
  }, []);

  useEffect(() => {
    let frame, lastHeight = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const height = sectionNav.current?.getBoundingClientRect().height || 64;
        if (height !== lastHeight) { root.current?.style.setProperty('--universe-nav-height', `${height}px`); lastHeight = height; }
        const positions = sections.flatMap(([id]) => {
          const element = document.getElementById(id);
          if (!element) return [];
          const bottom = id === 'gu-remasters' ? element.closest('.gu-game-section')?.getBoundingClientRect().bottom : undefined;
          return [{ id, top: element.getBoundingClientRect().top, bottom }];
        });
        const line = Math.max(96, height + 24);
        const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
        const id = activeUniverseSection(positions, line, atEnd);
        if (id) setActive(id);
      });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    if (root.current) observer?.observe(root.current);
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [sections]);

  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    if (typeof IntersectionObserver === 'undefined') return;
    const reveal = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('is-visible'); reveal.unobserve(entry.target); }
    }, { threshold: .08 });
    if (!reduced.matches) root.current?.querySelectorAll('[data-tlou-reveal]').forEach(element => { element.classList.add('tlou-will-reveal'); reveal.observe(element); });
    const stop = () => root.current?.querySelectorAll('.tlou-will-reveal').forEach(element => element.classList.add('is-visible'));
    reduced.addEventListener('change', stop);
    return () => { reveal.disconnect(); reduced.removeEventListener('change', stop); };
  }, [sections]);

  function navigate(event, id) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    router.push({ pathname: router.pathname, query: router.query, hash: id }, undefined, { shallow: true, scroll: false }).catch(() => {});
    scrollToSection(id, matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth');
    const heading = target.querySelector('h2,h1');
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    setActive(id);
  }
  function readAccent(event) {
    if (config.extractAccent === false) return;
    try {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 12;
      const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(event.target, 0, 0, 12, 12);
      const pixels = context.getImageData(0, 0, 12, 12).data, sums = [0, 0, 0]; let samples = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]], maximum = Math.max(...rgb), minimum = Math.min(...rgb);
        if (maximum < 35 || minimum > 220 || maximum - minimum < 18 || rgb[1] < rgb[0] * 1.08 || rgb[1] < rgb[2] * 1.1) continue;
        rgb.forEach((value, channel) => { sums[channel] += value; }); samples++;
      }
      if (samples) setAccent('rgb(' + sums.map(value => Math.round(Math.min(220, Math.max(140, 100 + value / samples * .9)))).join(',') + ')');
    } catch { /* Cross-origin media may disallow pixel access; keep the universe token. */ }
  }

  return <div className={`tlou-landing${config.aboutTextSide === 'right' ? ' is-about-reversed' : ''}`} ref={root} style={{ '--game-accent': accent, '--hero-mobile-position': config.heroMobilePosition || '58% center', '--about-position': config.aboutPosition || '58% center' }}>
    <UniverseHeroMotion><section className="tlou-hero" id="inicio" aria-labelledby="tlou-title">
      <div className={`tlou-hero-art${source?.includes('t_cover_big') ? ' is-portrait' : ''}`} aria-hidden="true">
        {source && <HeroImage key={source} src={source} fill priority quality={90} unoptimized={config.heroUnoptimized||!source.startsWith('/')} sizes={config.heroSizes || '100vw'} alt="" style={{ objectPosition: config.heroPosition }} onLoad={readAccent} onError={() => setFailed(old => [...old, source])} />}
      </div><div className="tlou-hero-shade" aria-hidden="true" />
      <div className="m-container tlou-hero-copy">
        <Link className="tlou-back" href="/jogos/universos"><Icon name="arrow-left" /> Universos de jogos</Link>
        <p className="m-eyebrow">{config.eyebrow}</p>
        <h1 id="tlou-title"><span className="sr-only">{universe.nome}</span><UniverseLogo logo={config.logo || universe.logo} priority /></h1>
        <p className="tlou-tagline">{config.tagline}</p>
        {config.release&&<UniverseReleaseCountdown release={config.release}/>}
        <div className="tlou-hero-actions"><a className="tlou-primary" href="#jogos" onClick={event => navigate(event, 'jogos')}>Explorar jogos <Icon name="arrow-right" /></a><a className="tlou-secondary" href="#sobre" onClick={event => navigate(event, 'sobre')}>Conhecer o universo</a>{mediaItem.trailer && <button className="tlou-trailer" type="button" onClick={() => setTrailerOpen(true)}><Icon name="play" /> Ver trailer</button>}</div>
        <div className="tlou-hero-caption"><span>{universe.mainStudio}</span><span>{data?.facts?.firstYear || config.firstYear} — {data?.facts?.lastYear || 'Hoje'}</span><span>Um universo. Muitas histórias.</span></div>
      </div>
      <a className="tlou-scroll" href="#sobre" onClick={event => navigate(event, 'sobre')}><span>SCROLL</span><Icon name="chevron-right" /><Icon name="chevron-right" /></a>
    </section></UniverseHeroMotion>
    <nav ref={sectionNav} className="tlou-section-nav" aria-label="Navegação neste universo">{sections.filter(([id]) => id !== 'inicio').map(([id, label]) => <a key={id} href={'#' + id} aria-current={active === id ? 'location' : undefined} onClick={event => navigate(event, id)}>{label}</a>)}</nav>
    <nav className="tlou-section-dots" aria-label="Seções do universo">{sections.map(([id, label]) => <a key={id} href={'#' + id} aria-label={label} title={label} aria-current={active === id ? 'location' : undefined} onClick={event => navigate(event, id)}><span aria-hidden="true" /></a>)}</nav>
    <section className="tlou-about" id="sobre" aria-labelledby="tlou-about-title">
      <div className="tlou-about-art" aria-hidden="true"><HeroImage src={config.about} fill quality={85} unoptimized={config.aboutUnoptimized||false} sizes="(max-width:760px) max(100vw, 720px), 68vw" alt="" /></div>
      <div className="m-container tlou-about-content" data-tlou-reveal><div className="tlou-about-copy"><p className="m-eyebrow">O UNIVERSO</p><h2 id="tlou-about-title">{config.aboutTitle}</h2>{config.paragraphs.map(text => <p key={text}>{text}</p>)}<div className="tlou-facts"><div><strong>{Number.isFinite(count) ? count : '—'}</strong><span>jogos oficiais</span></div><div><strong>{data?.facts?.firstYear || config.firstYear}</strong><span>o primeiro capítulo</span></div><div><strong>{universe.mainStudio}</strong><span>histórias que deixam marcas</span></div></div>
        {data && (view.hasLibraryGames ? <UniverseProgress seen={view.finished} total={data.total} label={`Você finalizou ${view.finished} de ${data.total}`} description="Jogos finalizados ou platinados neste universo" /> : <a className="tlou-text-link" href="#jogos" onClick={event => navigate(event, 'jogos')}>Encontre seu próximo capítulo <Icon name="arrow-right" /></a>)}
      </div></div>
    </section>
    {children}
    <div className="m-container tlou-media" data-tlou-reveal>{media.state.screenshots?.loading ? <section id="midia" aria-label="Carregando imagens do universo"><p className="m-eyebrow">DENTRO DESSE MUNDO</p><h2>Mídia</h2><div className="tlou-media-skeleton" role="status">{[1, 2, 3].map(key => <span className="m-skeleton" key={key} />)}<span className="sr-only">Carregando imagens</span></div></section> : <><p className="m-eyebrow">UM OLHAR PARA {config.mediaGame.titulo.toLocaleUpperCase('pt-BR')}</p><GameMedia item={mediaItem} />{(media.state.screenshots?.error || media.state.trailer?.error) && <p className="tlou-media-error" role="status">Parte das mídias está indisponível. <button type="button" onClick={media.retry}>Tentar novamente</button></p>}</>}</div>
    {catalog.rows.length > 0 && <section className="m-container tlou-avatars" id="avatares" aria-labelledby="tlou-avatars-title" data-tlou-reveal><div className="tlou-avatars-heading"><div><p className="m-eyebrow">LEVE ESSA HISTÓRIA COM VOCÊ</p><h2 id="tlou-avatars-title">Personagens do universo</h2><p>Escolha um personagem e leve esse universo para o seu perfil.</p></div><span><Icon name="user" /> Seu perfil, sua história</span></div><AvatarPicker catalog={catalog} headingId="tlou-avatars-title" actionLabel="Usar avatar" returnHref={`/jogos/universos/${universe.slug}#avatares`} /></section>}
    {otherUniverses}
    {trailerOpen && mediaItem.trailer && createPortal(<DetailModal title={`Trailer · ${config.mediaGame.titulo}`} className="game-full-trailer-modal" onClose={() => setTrailerOpen(false)} trapFocus inertBackground><video controls autoPlay playsInline preload="metadata" src={mediaItem.trailer.url} aria-label={`Trailer de ${config.mediaGame.titulo}`} /></DetailModal>, document.body)}
  </div>;
}
