import { fetchJson } from './api.js';
import { normalizeGame } from './game-search.js';
import {validReleaseDate} from './movie-release.js';
import {useIGDBCatalog} from './game-provider.js';
import {igdbCatalog} from './igdb-catalog.js';

export async function loadGameHighlights({ now = new Date(), fetcher = fetchJson, mode = 'hype', page = 1 } = {}) {
  if(useIGDBCatalog()&&fetcher===fetchJson)return igdbCatalog.highlights({now,mode,page});
  const key = process.env.RAWG_API_KEY;
  if (!key || key === 'cole_sua_chave_aqui') throw new Error('CONFIG');
  const day = 86400000;
  const today = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() + (mode === 'upcoming' ? 1 : mode === 'recent' ? -30 : -365) * day).toISOString().slice(0, 10);
  const to = mode==='recent' ? today : new Date(now.getTime() + 180 * day).toISOString().slice(0, 10);
  const ordering = mode === 'upcoming' ? 'released' : mode === 'recent' ? '-released' : '-added';
  const url = new URL('https://api.rawg.io/api/games');
  url.search = new URLSearchParams({ key, dates: `${from},${to}`, ordering, page_size: '40', exclude_additions: 'true', page: String(page) });
  const data = await fetcher(url);
  if(!Array.isArray(data?.results))throw Error('RAWG_UNAVAILABLE');
  const seen = new Set();
  const games = (data.results || []).filter(item => {
    if (!Number.isInteger(item.id) || item.id <= 0 || typeof item.name!=='string' || !item.name.trim() || !/^https:\/\//.test(item.background_image||'') || !(item.added > 0) || !validReleaseDate(item.released) || item.released < from || item.released > to || seen.has(item.id)) return false;
    seen.add(item.id); return true;
  }).sort((a, b) => mode==='hype' ? b.added - a.added : mode === 'upcoming' ? a.released.localeCompare(b.released) : b.released.localeCompare(a.released)).slice(0, mode === 'recent' ? 12 : 40).map(item => {
    const game = normalizeGame(item);
    return { ...game, estreia: item.released, releaseTba:item.tba===true, backdrop: game.poster, fonte: 'RAWG', catalogAdded: item.added, catalogVotes:item.ratings_count||0, metacritic:item.metacritic??null, sinopse: [game.generos.slice(0, 2).join(' / '), game.plataformas.join(' · ')].filter(Boolean).join(' — ') };
  });
  return { games, hasNext: !!data.next, basis: { source: 'RAWG', ordering, from, to } };
}
