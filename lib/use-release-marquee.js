import { useCallback, useEffect, useRef } from 'react';
import { useMotionPreferences } from './use-motion-preferences';

// Pixels per second; adjust the release row's automatic speed here.
export const MARQUEE_SPEED = 40;
const MANUAL_TRANSITION = 550;
const wrap = (value, width) => width ? ((value % width) + width) % width : 0;

export function useReleaseMarquee({ enabled, count, paused = false }) {
  const viewport = useRef(null), rail = useRef(null), group = useRef(null);
  const motion = useMotionPreferences(), preferences = useRef(motion);
  preferences.current = motion;
  const externalPause = useRef(paused);
  externalPause.current = paused;
  const model = useRef({ offset: 0, width: 0, viewportWidth: 0, hover: false, focus: false, visible: false, drag: null, target: null, wait: 0, suppress: false });
  useEffect(() => {
    const el = viewport.current, strip = rail.current, first = group.current;
    if (!enabled || !el || !strip || !first) return;
    const data = model.current;
    data.offset = 0; data.target = null; data.drag = null; data.suppress = false;
    const measure = () => { data.width = first.getBoundingClientRect().width; data.viewportWidth = el.clientWidth; };
    measure();
    const resize = new ResizeObserver(measure); resize.observe(el); resize.observe(first);
    const visibility = new IntersectionObserver(entries => { data.visible = entries[0].isIntersecting; }); visibility.observe(el);
    const wheel = event => {
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!delta) return;
      event.preventDefault(); data.target = null; data.offset += delta; data.wait = performance.now() + 1500;
    };
    el.addEventListener('wheel', wheel, { passive: false });
    let frame, previous;
    const tick = time => {
      const dt = previous === undefined ? 0 : Math.min(time - previous, 64); previous = time;
      if (data.target) {
        const fraction = Math.min(1, (time - data.target.start) / MANUAL_TRANSITION);
        const easing = 1 - Math.pow(1 - fraction, 3);
        data.offset = data.target.from + data.target.delta * easing;
        if (fraction === 1) data.target = null;
      } else if (data.visible && !data.hover && !data.focus && !data.drag && !externalPause.current && time > data.wait && !preferences.current.reduced && !preferences.current.hidden && count > 1) data.offset += MARQUEE_SPEED * dt / 1000;
      // Layout dimensions come from ResizeObserver, never measured per frame.
      const position = wrap(data.offset, data.width);
      if (!data.target) data.offset = position;
      strip.style.transform = `translate3d(${-position}px,0,0)`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); resize.disconnect(); visibility.disconnect(); el.removeEventListener('wheel', wheel); };
  }, [enabled, count]);
  const move = useCallback(direction => {
    const data = model.current, delta = direction * data.viewportWidth * .85;
    data.wait = performance.now() + MANUAL_TRANSITION + 1500;
    if (preferences.current.reduced) { data.offset += delta; data.target = null; }
    else data.target = { from: data.offset, delta, start: performance.now() };
  }, []);
  const events = {
    onPointerEnter: event => { if (event.pointerType === 'mouse') model.current.hover = true; },
    onPointerLeave: event => { if (event.pointerType === 'mouse') model.current.hover = false; },
    onFocusCapture: event => {
      const data = model.current; data.focus = true;
      const card = event.target.closest('.upcoming-cover-card,[data-marquee-card]'), el = viewport.current;
      if (!card || !el) return;
      const bounds = card.getBoundingClientRect(), windowBounds = el.getBoundingClientRect();
      if (bounds.left < windowBounds.left || bounds.right > windowBounds.right) {
        data.target = null; data.offset = Math.max(0, data.offset + bounds.left - windowBounds.left - 12);
      }
    },
    onBlurCapture: event => { if (!event.currentTarget.contains(event.relatedTarget)) model.current.focus = false; },
    onDragStart: event => event.preventDefault(),
    onPointerDown: event => {
      if (event.button !== 0 || !event.isPrimary || event.target.closest('button')) return;
      const data = model.current;
      data.suppress = false; data.target = null;
      data.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, offset: data.offset, moved: false };
    },
    onPointerMove: event => {
      const data = model.current, drag = data.drag;
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(event.clientY - drag.y)) { drag.moved = true; event.currentTarget.setPointerCapture(event.pointerId); }
      if (drag.moved) { data.offset = drag.offset - dx; data.suppress = true; }
    },
    onPointerUp: () => { model.current.drag = null; model.current.wait = performance.now() + 1500; },
    onPointerCancel: () => { model.current.drag = null; },
    onLostPointerCapture: () => { model.current.drag = null; },
    onClickCapture: event => { if (model.current.suppress) { event.preventDefault(); event.stopPropagation(); model.current.suppress = false; } },
    onKeyDown: event => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1); } },
    onScroll: () => { const el = viewport.current; if (el?.scrollLeft) { model.current.offset += el.scrollLeft; el.scrollLeft = 0; } },
  };
  return { viewport, rail, group, move, events };
}
