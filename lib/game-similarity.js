import { fetchJson } from './api.js';
import { normalizeGame } from './game-search.js';
import {useIGDBCatalog,decodeIGDBGameId} from './game-provider.js';
import {igdbCatalog} from './igdb-catalog.js';

export const SIMILAR_GAME_LIMIT = 8;
const styleTags = new Set(['metroidvania','souls-like','roguelike','rogue-lite','2d-platformer','3d-platformer','turn-based','turn-based-combat','tactical','survival-horror','fighting','racing','city-builder','deckbuilding','immersive-sim']);
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const ids = rows => new Set((rows || []).map(row => String(row.id)));
const overlap = (rows, set) => (rows || []).filter(row => set.has(String(row.id))).length;

export function rankSimilarGames(seed, groups) {
  const developers = ids(seed.developers), genres = ids((seed.genres || []).filter(genre => genre.slug !== 'indie'));
  const styles = new Set((seed.tags || []).filter(tag => styleTags.has(tag.slug)).map(tag => tag.slug));
  const seedTitle = normalize(seed.name), found = new Map();
  for (const { kind, rows } of groups) for (const candidate of rows) {
    if (!Number.isInteger(candidate.id) || candidate.id <= 0 || candidate.id === seed.id || !candidate.name || !candidate.background_image || candidate.parent_game || candidate.parent_games_count > 0) continue;
    if (!(candidate.added >= 100 || candidate.ratings_count >= 10)) continue;
    if (/\b(?:demake|soundtrack|bundle|scene design|fan ?(?:game|made)|demo)\b/i.test(candidate.name)) continue;
    const sameDeveloper = overlap(candidate.developers, developers) > 0 || kind === 'developer';
    const sameSeries = kind === 'series' || sameDeveloper && normalize(candidate.name).startsWith(seedTitle + ' ');
    const sharedStyles = (candidate.tags || []).filter(tag => styles.has(tag.slug));
    const sharedGenres = overlap(candidate.genres, genres);
    // "Indie" or one broad genre alone is not sufficient evidence of similarity.
    if (!sameSeries && !sameDeveloper && !sharedStyles.length && sharedGenres < 2) continue;
    const score = (sameSeries ? 1000 : 0) + sharedStyles.length * 100 + (sameDeveloper ? 80 : 0) + sharedGenres * 8;
    const reason = sameSeries ? 'Mesma série' : sharedStyles.length ? `Mesmo estilo · ${sharedStyles[0].name || sharedStyles[0].slug}` : sameDeveloper ? 'Mesmo estúdio' : 'Estilo e gêneros em comum';
    const prior = found.get(candidate.id);
    if (!prior || score > prior.score) found.set(candidate.id, { ...normalizeGame(candidate), similarityReason: reason, score });
  }
  return [...found.values()].sort((a, b) => b.score - a.score || (b.nota ?? -1) - (a.nota ?? -1)).slice(0, SIMILAR_GAME_LIMIT).map(({ score, ...item }) => item);
}

export async function similarGameCandidates(id, { fetcher = fetchJson, key = process.env.RAWG_API_KEY } = {}) {
  if((useIGDBCatalog()&&fetcher===fetchJson)||decodeIGDBGameId(id))return igdbCatalog.similar(id);
  if (!key || key === 'cole_sua_chave_aqui') throw new Error('CONFIG');
  const request = (path, params = {}) => { const url = new URL(`https://api.rawg.io/api/${path}`); url.search = new URLSearchParams({ key, ...params }); return fetcher(url); };
  const seed = await request(`games/${id}`);
  const developers = (seed.developers || []).filter(row => Number.isInteger(row.id)).slice(0, 2).map(row => row.id);
  const precise = (seed.tags || []).filter(tag => styleTags.has(tag.slug)).slice(0, 2);
  const genres = (seed.genres || []).filter(genre => genre.slug !== 'indie').slice(0, 2);
  const jobs = [
    ['series', () => request(`games/${id}/game-series`, { page_size: '20' })],
    ['search', () => request('games', { search: seed.name, search_precise: 'true', page_size: '20', exclude_additions: 'true' })],
    ...developers.map(developer => ['developer', () => request('games', { developers: String(developer), ordering: '-added', page_size: '20', exclude_additions: 'true' })]),
    ...(precise.length ? precise.map(tag => ['style', () => request('games', { tags: tag.slug, ordering: '-added', page_size: '30', exclude_additions: 'true' })]) : genres.length ? [['genre', () => request('games', { genres: genres.map(genre => genre.id).join(','), ordering: '-added', page_size: '30', exclude_additions: 'true' })]] : []),
  ];
  const results = await Promise.allSettled(jobs.map(async ([kind, load]) => ({ kind, rows: (await load()).results || [] })));
  if (results.every(result => result.status === 'rejected')) throw new Error('CATALOG');
  return { games: rankSimilarGames(seed, results.filter(result => result.status === 'fulfilled').map(result => result.value)), partial: results.some(result => result.status === 'rejected') };
}
