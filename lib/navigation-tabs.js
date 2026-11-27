export const tabNavigationSelector = '[role="tablist"],.movie-top-nav,.games-top-nav,.gc-tabs,.tlou-section-nav,.sw-nav,.mu-shelf-links,.vs-tabs,.movie-site-header>nav';

export function validTab(value, keys, fallback) {
 return typeof value === 'string' && keys.includes(value) ? value : fallback;
}

export function navigationLinkIndex(hrefs, current) {
 let location;
 try { location = new URL(current, 'https://void.local'); } catch { return -1; }
 let selected = -1, best = 0;
 hrefs.forEach((href, index) => {
  if (!href) return;
  let target;
  try { target = new URL(href, location); } catch { return; }
  if (target.origin !== location.origin || target.pathname.replace(/\/$/, '') !== location.pathname.replace(/\/$/, '')) return;
  const score = target.hash ? (target.hash === location.hash ? 3 : 0) : 1;
  if (score > best) { selected = index; best = score; }
 });
 return selected;
}
