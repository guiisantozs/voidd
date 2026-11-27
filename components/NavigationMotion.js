import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { navigationLinkIndex, tabNavigationSelector } from '../lib/navigation-tabs';

// Enhance the existing tab/route bars without replacing their links, handlers,
// keyboard controls or ARIA. Ordinary buttons and filter groups are excluded.
export default function NavigationMotion() {
 const router = useRouter();
 useEffect(() => {
  const bars = new Map(); let frame = 0, disposed = false;
  const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(update); };
  function updateBar(bar, state) {
   bar.classList.add('void-tab-navigation');
   if(getComputedStyle(bar).position==='static')bar.classList.add('void-tab-static');
   if(bar.lastElementChild!==state.line)bar.appendChild(state.line);
   const items = [...bar.querySelectorAll('a[href],button,[role="tab"]')].filter(item => item.closest(tabNavigationSelector) === bar);
   for (const old of state.items) if (!items.includes(old)) { state.resize.unobserve(old); old.classList.remove('void-nav-item'); old.removeAttribute('data-void-current'); }
   for (const item of items) { item.classList.add('void-nav-item'); if (!state.items.includes(item)) state.resize.observe(item); }
   state.items = items;
   const enabled = item => item && !item.disabled && item.getAttribute('aria-disabled') !== 'true';
   let active = items.find(item => item.getAttribute('aria-selected') === 'true' || item.getAttribute('aria-pressed') === 'true' || ['page', 'location', 'true'].includes(item.getAttribute('aria-current')));
   if (!active) active = items[navigationLinkIndex(items.map(item => item.getAttribute('href')), location.href)];
   if (active !== state.active) {
    state.active = active;
    if (enabled(active) && bar.scrollWidth > bar.clientWidth && ['auto','scroll'].includes(getComputedStyle(bar).overflowX)) {
     const root=bar.getBoundingClientRect(),rect=active.getBoundingClientRect();
     const shift=rect.left<root.left?rect.left-root.left:rect.right>root.right?rect.right-root.right:0;
     if(shift)bar.scrollTo({left:bar.scrollLeft+shift,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    }
   }
   for (const item of items) {
    const value = item === active ? 'true' : 'false';
    if (item.getAttribute('data-void-current') !== value) item.setAttribute('data-void-current', value);
   }
   const focused = items.find(item => item === document.activeElement || item.contains(document.activeElement));
   const target = enabled(state.hover) && items.includes(state.hover) ? state.hover : enabled(active) ? active : enabled(focused) ? focused : null;
   if (!target || !target.getClientRects().length) { state.line.style.opacity = '0'; return; }
   const root = bar.getBoundingClientRect(), rect = target.getBoundingClientRect();
   const x = rect.left - root.left - bar.clientLeft + bar.scrollLeft;
   const y = rect.bottom - root.top - bar.clientTop + bar.scrollTop - 2;
   state.line.style.transform = `translate3d(${x}px,${y}px,0)`;
   state.line.style.width = `${rect.width}px`; state.line.style.opacity = '1';
  }
  function mount(bar) {
   const line = document.createElement('span'); line.className = 'void-nav-indicator'; line.setAttribute('aria-hidden', 'true');
   bar.classList.add('void-tab-navigation');
   if (getComputedStyle(bar).position === 'static') bar.classList.add('void-tab-static');
   bar.appendChild(line);
   const resize = new ResizeObserver(schedule);
   const state = { line, resize, items: [], hover: null };
   const over = event => { const item = event.target.closest?.('a[href],button,[role="tab"]'); if (item?.closest(tabNavigationSelector) === bar) { state.hover = item; schedule(); } };
   const leave = () => { state.hover = null; schedule(); };
   bar.addEventListener('pointerover', over); bar.addEventListener('pointerleave', leave); bar.addEventListener('focusin', schedule); bar.addEventListener('focusout', schedule); bar.addEventListener('scroll', schedule, { passive: true });
   resize.observe(bar);
   state.cleanup = () => { resize.disconnect(); line.remove(); bar.classList.remove('void-tab-navigation', 'void-tab-static'); for (const item of state.items) { item.classList.remove('void-nav-item'); item.removeAttribute('data-void-current'); } bar.removeEventListener('pointerover', over); bar.removeEventListener('pointerleave', leave); bar.removeEventListener('focusin', schedule); bar.removeEventListener('focusout', schedule); bar.removeEventListener('scroll', schedule); };
   bars.set(bar, state);
  }
  function update() {
   frame = 0;
   for (const [bar, state] of bars) if (!bar.isConnected) { state.cleanup(); bars.delete(bar); }
   for (const bar of document.querySelectorAll(tabNavigationSelector)) if (!bars.has(bar)) mount(bar);
   for (const [bar, state] of bars) updateBar(bar, state);
  }
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-selected', 'aria-current', 'aria-pressed', 'hidden'] });
  const resized=()=>{for(const bar of bars.keys())bar.classList.remove('void-tab-static');schedule();};
  window.addEventListener('resize', resized); window.addEventListener('hashchange', schedule); window.addEventListener('popstate', schedule);
  router.events.on('routeChangeComplete', schedule); router.events.on('hashChangeComplete', schedule);
  document.fonts?.ready.then(schedule); schedule();
  return () => { disposed = true; observer.disconnect(); cancelAnimationFrame(frame); for (const state of bars.values()) state.cleanup(); window.removeEventListener('resize', resized); window.removeEventListener('hashchange', schedule); window.removeEventListener('popstate', schedule); router.events.off('routeChangeComplete', schedule); router.events.off('hashChangeComplete', schedule); };
 }, [router.events]);
 return null;
}
