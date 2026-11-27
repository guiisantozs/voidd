import { useEffect, useRef, useState } from 'react';
import { formatRating } from '../../lib/catalog';

export const libraryStatusIcons = { all: 'gamepad', want: 'plus', playing: 'play', playing_now: 'play', finished: 'check', paused: 'pause', platinum: 'diamond', abandoned: 'close', none: 'minus' };

// Presentation only: real values remain available to assistive technology.
export function LibraryNumber({ value, ready, rating = false,unit=true }) {
  const [frameValue, setFrameValue] = useState(null);
  const played = useRef(false);
  useEffect(() => {
    if (!ready || played.current || !Number.isFinite(value)) return;
    played.current = true;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motion.matches) return;
    let frame, start;
    const stop = () => { cancelAnimationFrame(frame); setFrameValue(null); };
    const draw = time => {
      start ??= time;
      const progress = Math.min(1, (time - start) / 880);
      setFrameValue(value * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(draw); else setFrameValue(null);
    };
    frame = requestAnimationFrame(draw);
    motion.addEventListener('change', stop);
    return () => { cancelAnimationFrame(frame); motion.removeEventListener('change', stop); };
  }, [ready]);
  const format = number => !Number.isFinite(number) ? '—' : rating ? `${formatRating(number)}${unit?' / 5':''}` : Math.round(number).toLocaleString('pt-BR');
  return <><span className="sr-only">{ready ? format(value) : '—'}</span><span aria-hidden="true">{ready ? format(frameValue ?? value) : '—'}</span></>;
}

export function LibraryStatusRail({ active, children }) {
  const rail = useRef(null);
  useEffect(() => {
    const element = rail.current;
    const selected = element?.querySelector('[aria-pressed="true"]');
    if (!selected) return;
    const center = () => {
      element.scrollTo({ left: selected.offsetLeft - element.offsetLeft - (element.clientWidth - selected.offsetWidth) / 2, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    };
    const frame = requestAnimationFrame(center);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    motion.addEventListener('change', center);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(center);
    observer?.observe(element); observer?.observe(selected);
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); motion.removeEventListener('change', center); };
  }, [active]);
  return <div className="library-status-rail"><div ref={rail} className="library-status-tabs" role="group" aria-label="Filtrar minha biblioteca">{children}</div></div>;
}

export default function LibrarySurface({ children, className = 'games-shell games-library library-design' }) {
  const surface = useRef(null);
  useEffect(() => {
    const root = surface.current;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    let selected, bounds, pointerFrame, point;
    function reset() {
      cancelAnimationFrame(pointerFrame);
      if (selected) for (const key of ['--library-tilt-x', '--library-tilt-y', '--library-light-x', '--library-light-y']) selected.style.removeProperty(key);
      selected = null; bounds = null; point = null;
    }
    function move(event) {
      if (motion.matches || !pointer.matches || event.pointerType !== 'mouse') return;
      if (event.target.closest('button,input,select,textarea,dialog,[role="dialog"]')) { reset(); return; }
      const card = event.target.closest('.library-cover-card');
      if (!card || !root.contains(card)) { reset(); return; }
      if (selected !== card) { reset(); selected = card; }
      point = { x: event.clientX, y: event.clientY };
      cancelAnimationFrame(pointerFrame);
      pointerFrame = requestAnimationFrame(() => {
        if (selected !== card || !point) return;
        // Cache geometry while hovering: transforms must not force a layout on
        // every pointer event or feed their own changed bounds back into tilt.
        bounds ||= card.querySelector('.upcoming-art').getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        const x = Math.max(0, Math.min(1, (point.x - bounds.left) / bounds.width));
        const y = Math.max(0, Math.min(1, (point.y - bounds.top) / bounds.height));
        card.style.setProperty('--library-tilt-x', `${(0.5 - y) * 12}deg`);
        card.style.setProperty('--library-tilt-y', `${(x - 0.5) * 12}deg`);
        card.style.setProperty('--library-light-x', `${x * 100}%`);
        card.style.setProperty('--library-light-y', `${y * 100}%`);
      });
    }
    // Synchronize only the image that actually loaded, instead of observing
    // every search-result mutation and rescanning the whole library.
    function syncImage(image) {
      const card = image?.closest('.library-playing-card');
      if (!card || !image.matches('.game-portrait-cover img')) return;
      const value = `url(${JSON.stringify(image.currentSrc || image.src)})`;
      if (card.style.getPropertyValue('--library-cover-image') !== value) card.style.setProperty('--library-cover-image', value);
    }
    const loaded = event => syncImage(event.target);
    const failed = event => event.target.closest?.('.library-playing-card')?.style.removeProperty('--library-cover-image');
    root.querySelectorAll('.library-playing-card .game-portrait-cover img').forEach(syncImage);
    root.addEventListener('pointermove', move); root.addEventListener('pointerleave', reset); root.addEventListener('pointerdown', reset);
    root.addEventListener('load', loaded, true); root.addEventListener('error', failed, true); root.addEventListener('scroll', reset, true); window.addEventListener('resize', reset);
    motion.addEventListener('change', reset); pointer.addEventListener('change', reset);
    return () => { reset(); root.removeEventListener('pointermove', move); root.removeEventListener('pointerleave', reset); root.removeEventListener('pointerdown', reset); root.removeEventListener('load', loaded, true); root.removeEventListener('error', failed, true); root.removeEventListener('scroll', reset, true); window.removeEventListener('resize', reset); motion.removeEventListener('change', reset); pointer.removeEventListener('change', reset); };
  }, []);
  return <div ref={surface} className={className}>{children}</div>;
}
