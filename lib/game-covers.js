import {steamAppId} from './game-collection.js';
// Shared server pipeline for home, game discovery and lists.
export function createGameCoverResolver({ loadGame, findCover, loadStores, now = Date.now, limit = 500 }) {
  const cache = new Map();
  return async function resolveCover(id) {
    let entry = cache.get(id);
    if (entry && entry.expires > now()) return entry.promise;
    if (cache.size >= limit) cache.delete(cache.keys().next().value);
    entry = { expires: now() + 3600000 };
    entry.promise = (async () => {
      const [game,stores]=await Promise.all([loadGame(id),loadStores?loadStores(id).catch(()=>[]):Promise.resolve([])]);
      const steam=stores.map(store=>steamAppId(store.url)).find(Boolean),storeHint=steam?{steamAppId:steam}:{};
      let fallback = null;
      try {
        const image = new URL(game.background_image);
        if (image.protocol === 'https:' && image.hostname === 'media.rawg.io') fallback = {
          url: image.href, source: 'RAWG', sourceUrl: `https://rawg.io/games/${encodeURIComponent(game.slug || id)}`,
        };
      } catch { /* No usable catalogue art; the client retains its saved image. */ }
      try {
        const cover = await findCover(game);
        entry.expires = now() + (cover ? 3600000 : 300000);
        return { status: 200, body: { cover, fallback,...storeHint } };
      } catch (error) {
        if (cache.get(id) === entry) cache.delete(id);
        return { status: error.message === 'IGDB_CONFIG' ? 503 : 502, body: {
          cover: null, fallback,...storeHint, erro: error.message === 'IGDB_CONFIG'
            ? 'Capas IGDB não configuradas no servidor.' : 'Capas IGDB temporariamente indisponíveis.',
        } };
      }
    })().catch(error => { if (cache.get(id) === entry) cache.delete(id); throw error; });
    cache.set(id, entry);
    return entry.promise;
  };
}
