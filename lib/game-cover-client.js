const CACHE_KEY = 'void:game-covers:v2';
export const gameCoverId = id => ['number', 'string'].includes(typeof id) && /^[1-9]\d{0,9}$/.test(String(id)) ? String(id) : null;
export function officialGameCover(value) {
  if (!/^https:\/\/images\.igdb\.com\/igdb\/image\/upload\/t_cover_big(?:_2x)?\/[-a-zA-Z0-9_]+\.jpg$/.test(value?.url || '')) return null;
  const cover = { url: value.url, source: 'IGDB' };
  if(Number.isInteger(value.width)&&Number.isInteger(value.height)&&value.width>0&&value.height>0&&value.width<=16000&&value.height<=16000){cover.width=value.width;cover.height=value.height;}
  if (/^https:\/\/www\.igdb\.com\/games\/[-a-z0-9]+$/.test(value.sourceUrl || '')) cover.sourceUrl = value.sourceUrl;
  if (/^https:\/\/images\.igdb\.com\/igdb\/image\/upload\/t_1080p(?:_2x)?\/[-a-zA-Z0-9_]+\.jpg$/.test(value.heroArtwork?.url || '')) cover.heroArtwork = { url: value.heroArtwork.url, source: 'IGDB', portrait: !!value.heroArtwork.portrait, width: value.heroArtwork.width, height: value.heroArtwork.height };
  return cover;
}
export function gameCoverImageSet(value) {
  const cover = officialGameCover(value); if (!cover) return undefined;
  const variants=[['cover_big_2x',528]];
  // Never enlarge a thumbnail. Only offer the 1080px fit when the provider's
  // original image really contains that resolution; retain the same image ID.
  if(cover.height>=1080&&cover.width>528){const width=Math.floor(Math.min(1920,1080*cover.width/cover.height));if(width>528)variants.push(['1080p',width]);}
  return variants.map(([size,width])=>`${cover.url.replace(/\/t_cover_big(?:_2x)?\//,`/t_${size}/`)} ${width}w`).join(', ');
}
export function rawgArtwork(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'media.rawg.io' && !url.username && !url.password && /^\/media\/(games|screenshots)\//.test(url.pathname) ? url.href : ''; } catch { return ''; }
}
export function steamCoverArtwork(value) {
  try {
    const url=new URL(value);
    if(url.protocol!=='https:'||url.port||url.username||url.password||url.search||url.hash)return null;
    if(!/^(?:(?:cdn\.akamai|cdn\.cloudflare|shared\.fastly|shared\.akamai)\.steamstatic\.com|steamcdn-a\.akamaihd\.net)$/.test(url.hostname))return null;
    return /^\/(?:store_item_assets\/)?steam\/apps\/[1-9]\d{0,11}\/(?:[a-f0-9]{12,64}\/)?(?:library_600x900(?:_2x)?|header|library_hero(?:_2x)?|capsule_616x353)\.(?:jpg|png)$/.test(url.pathname)?url.href:null;
  } catch { return null; }
}
export function gameSteamAppId(item={}) {
  const candidates=[item.steamAppId,item.steam_appid,...(Array.isArray(item.platforms)?item.platforms.filter(row=>row.provider==='steam').map(row=>row.external_id):[])];
  for(const id of candidates)if(/^[1-9]\d{0,11}$/.test(String(id||'')))return String(id);
  for(const image of [item.poster,item.backdrop,item.cover_url,item.storePoster?.url]) {
    const safe=steamCoverArtwork(image);if(safe)return new URL(safe).pathname.match(/\/steam\/apps\/([1-9]\d{0,11})\//)[1];
  }
  return null;
}
export function gameCoverIdentity(item) {
  return JSON.stringify([gameCoverId(item.id),gameSteamAppId(item),officialGameCover(item.officialCover)?.url,item.poster,item.backdrop]);
}
export function gameCoverCandidates(item, state, { portraitOnly = false } = {}) {
  const sources=[],cover=officialGameCover(state?.data?.cover)||officialGameCover(item.officialCover);
  if(cover)sources.push({kind:'portrait',...cover});
  // A lower-priority image must never appear while the official lookup is pending.
  if(state?.loading)return sources;
  const appid=gameSteamAppId(item)||gameSteamAppId(state?.data);
  const bases=appid?[`https://cdn.akamai.steamstatic.com/steam/apps/${appid}/`,`https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appid}/`]:[];
  for(const url of [item.poster,item.backdrop].map(steamCoverArtwork).filter(Boolean))if(/\/library_600x900(?:_2x)?\.(jpg|png)$/.test(new URL(url).pathname))sources.push({kind:'portrait',url,source:'Steam'});
  sources.push(...bases.map(base=>({kind:'portrait',url:base+'library_600x900.jpg',source:'Steam'})));
  if(!portraitOnly) {
    for(const url of [item.poster,item.backdrop].map(steamCoverArtwork).filter(Boolean))if(!/\/library_600x900/.test(url))sources.push({kind:'landscape',url,source:'Steam'});
    sources.push(...bases.map(base=>({kind:'landscape',url:base+'header.jpg',source:'Steam'})));
    for(const url of [state?.data?.fallback?.url,item.poster,item.backdrop,item.rawg_background,item.rawg_additional,...(Array.isArray(item.screenshots)?item.screenshots.slice(0,2):[])].map(rawgArtwork).filter(Boolean))sources.push({kind:'landscape',url,source:'RAWG'});
  }
  return [...new Map(sources.map(image=>[image.url,image])).values()];
}
export function gameCoverPresentation(item, state, { portraitOnly = false, failed = [] } = {}) {
  const image=gameCoverCandidates(item,state,{portraitOnly}).find(candidate=>!failed.includes(candidate.url));
  if(image)return image;
  if(state?.loading)return {kind:'loading'};
  return { kind: 'unavailable' };
}
// This cache contains public catalogue metadata only, never account records.
export function createGameCoverClient({ fetcher = (...args) => fetch(...args), now = Date.now, storage = () => typeof window !== 'undefined' ? window.sessionStorage : null, limit = 150, concurrency = 4 } = {}) {
  const cache = new Map(), pending = new Map(), queue = []; let active = 0, hydrated = false;
  const sanitize = data => ({ cover: officialGameCover(data?.cover), fallback: rawgArtwork(data?.fallback?.url) ? { url: rawgArtwork(data.fallback.url), source: 'RAWG' } : null,...(gameSteamAppId(data)?{steamAppId:gameSteamAppId(data)}:{}) });
  function hydrate() {
    if (hydrated) return;
    try { const store = storage(); if (!store) return; hydrated = true; const entries = JSON.parse(store.getItem(CACHE_KEY) || '[]'); if (!Array.isArray(entries)) return;
      for (const pair of entries.slice(-limit)) { if (!Array.isArray(pair)) continue; const [id, entry] = pair; if (gameCoverId(id) && entry?.expires > now()) cache.set(id, { data: sanitize(entry.data), expires: entry.expires, error: false }); }
    } catch { hydrated = true; }
  }
  function persist() { try { storage()?.setItem(CACHE_KEY, JSON.stringify([...cache].filter(([, entry]) => !entry.error && entry.expires > now()).slice(-limit))); } catch { /* Storage is optional. */ } }
  function peek(id) { hydrate(); const entry = cache.get(gameCoverId(id)); return entry?.expires > now() ? entry : null; }
  function pump() { while (active < concurrency && queue.length) { active++; const task = queue.shift(); Promise.resolve().then(task.run).then(task.resolve, task.reject).finally(() => { active--; pump(); }); } }
  function load(id, { force = false, priority = false } = {}) {
    id = gameCoverId(id); if (!id) return Promise.resolve({ data: { cover: null, fallback: null }, error: true, expires: now() + 15000 });
    if (pending.has(id)) { if(priority){const index=queue.findIndex(task=>task.id===id);if(index>0)queue.unshift(queue.splice(index,1)[0]);} return pending.get(id); }
    const hit = peek(id); if (!force && hit) return Promise.resolve(hit);
    const promise = new Promise((resolve, reject) => { const task={ id, resolve, reject, run: async () => {
      let entry;
      try { const response = await fetcher(`/api/game-cover?v=2&id=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(20000) }), data = sanitize(await response.json());
        entry = { data, error: !response.ok, expires: now() + (!response.ok ? 15000 : data.cover ? 3600000 : 300000) };
      } catch { entry = { data: { cover: null, fallback: null }, error: true, expires: now() + 15000 }; }
      if (cache.size >= limit) cache.delete(cache.keys().next().value); cache.set(id, entry); if (!entry.error) persist(); return entry;
    } }; if(priority)queue.unshift(task);else queue.push(task); });
    pending.set(id, promise); pump(); promise.finally(() => pending.delete(id)); return promise;
  }
  return { peek, load };
}
export const gameCoverClient = createGameCoverClient();
