import { fetchJson } from './api.js';
import { gameGenres, parentPlatforms } from './game-filters.js';
import {useIGDBCatalog} from './game-provider.js';
import {igdbCatalog} from './igdb-catalog.js';
import {normalizeSearchTerm,shortSearch} from './catalog-cache-policy.js';

export const PAGE_SIZE = 18;
export function parseGameSearch(input = {}) {
  const defaults = { q: '', page: '1', platform: 'all', genre: 'all', order: 'popular', year: '', tag: '', developer: '', publisher: '' };
  const options = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = input[key] ?? fallback;
    if (typeof value !== 'string') throw new Error('INVALID');
    options[key] = value.trim();
  }
  options.q=normalizeSearchTerm(options.q);
  if(shortSearch(options.q))throw Error('INVALID');
  if ((options.year && (!/^\d{4}$/.test(options.year) || +options.year < 1950 || +options.year > 2099)) || options.q.length > 100 || !/^[1-9][0-9]{0,2}$/.test(options.page) || Number(options.page) > 500
    || !['all', ...Object.keys(parentPlatforms)].includes(options.platform)
    || !['all', ...gameGenres.map(genre => genre.key)].includes(options.genre)
    || !['popular', 'rating', 'year'].includes(options.order) || ['tag','developer','publisher'].some(key=>options[key]&&!/^[1-9]\d{0,9}$/.test(options[key]))) throw new Error('INVALID');
  return { ...options, page: Number(options.page) };
}

export async function searchGames(options) {
  if(useIGDBCatalog())return igdbCatalog.search(options);
  const key = process.env.RAWG_API_KEY;
  if (!key || key === 'cole_sua_chave_aqui') throw new Error('CONFIG');
  const url = new URL('https://api.rawg.io/api/games');
  url.searchParams.set('key', key);
  url.searchParams.set('page', String(options.page));
  url.searchParams.set('page_size', String(PAGE_SIZE));
  if (options.year) url.searchParams.set('dates', `${options.year}-01-01,${options.year}-12-31`);
  if (options.q) url.searchParams.set('search', options.q);
  if (options.platform !== 'all') url.searchParams.set('parent_platforms', parentPlatforms[options.platform]);
  if (options.genre !== 'all') url.searchParams.set('genres', options.genre);
  for (const [input,output] of [['tag','tags'],['developer','developers'],['publisher','publishers']]) if(options[input])url.searchParams.set(output,options[input]);
  const order = { rating: '-rating', year: '-released', popular: options.q ? null : '-added' }[options.order];
  if (order) url.searchParams.set('ordering', order);
  let data;
  try { data = await fetchJson(url); }
  catch (error) { if (error.status !== 404) throw error; data = { results: [], count: 0, next: null }; }
  const jogos = (data.results || []).map(normalizeGame);
  return { jogos, pagination: { page: options.page, pageSize: PAGE_SIZE,
    total: Number.isFinite(data.count) && data.count >= 0 ? data.count : jogos.length,
    hasNext: Boolean(data.next) && options.page < 500 } };
}

export function normalizeGame(item) {
  return {
    id: item.id, categoria: 'jogos', titulo: item.name,
    nota: item.ratings_count > 0 ? item.rating : null,
    estreia: item.released || null, poster: item.background_image || null, ano: (item.released || '').slice(0, 4), sinopse: '',
    generos: (item.genres || []).map(genre => genre.name),
    plataformas: (item.parent_platforms || []).map(entry => entry.platform?.name).filter(Boolean),
  };
}
