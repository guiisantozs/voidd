export function publicStorePoster(stores = []) {
  for (const store of stores) {
    try {
      const url = new URL(store.url);
      const id = /^(?:\/app\/)([1-9]\d{0,11})(?:\/|$)/.exec(url.pathname)?.[1];
      if (['http:', 'https:'].includes(url.protocol) && url.hostname === 'store.steampowered.com' && id) return { url: `https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_hero_2x.jpg`, portrait: false, source: 'Steam' };
    } catch {}
  }
  return null;
}
export function keyArtCandidates(item, cover, { pending = false } = {}) {
  if (pending) return [];
  const result = [];
  const hero = cover?.heroArtwork||item.officialCover?.heroArtwork;
  if (hero && !hero.portrait && /^https:\/\/images\.igdb\.com\/igdb\/image\/upload\/t_1080p(?:_2x)?\/[-a-zA-Z0-9_]+\.jpg$/.test(hero.url || '')) result.push(hero);
  if (/^https:\/\/cdn\.akamai\.steamstatic\.com\/steam\/apps\/[1-9]\d{0,11}\/library_hero_2x\.jpg$/.test(item.storePoster?.url || '')) result.push({ ...item.storePoster, portrait: false, source: 'Steam' }, { url: item.storePoster.url.replace('_2x.jpg','.jpg'), source: 'Steam', portrait: false });
  // A full-bleed media fallback is preferable to a small portrait cover on the side.
  for (const source of [...new Set([item.poster, item.backdrop, ...(item.screenshots || []).slice(0, 2)].filter(Boolean))]) try {
    const url = new URL(source);
    if (url.protocol === 'https:' && url.hostname === 'media.rawg.io' && /^\/media\/(?:games|screenshots)\//.test(url.pathname)) result.push({ url: url.href, source: 'RAWG', portrait: false, fallback: true });
  } catch {}
  return result;
}
export function usableKeyArt(image, width, height) {
  return !image.portrait && width >= 1600 && height >= 600 && width / height >= 1.35;
}
