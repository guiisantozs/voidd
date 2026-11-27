import { normalizeReview, parseRating } from './ratings.js';
import { prepareMovieReview } from './movie-release-client.js';
import { accountGenerationStorage } from './account-cache-lifecycle.js';

export const DATA_EVENT = 'void:account-data';
export const REVIEWS_KEY = 'void:reviews:v1';
export const LIST_KEY = 'void:library:v1';
export const MOVIES_KEY = 'void:movie-watchlist:v1';
export const SERIES_KEY = 'void:series-watchlist:v1';
export const ANIMES_KEY = 'void:anime-watchlist:v1';
let activeUser = null;
export const accountKey = id => `void:account:${id}:v1`;
function normalizeStored(key, value) {
  if (!value || (key !== REVIEWS_KEY && !key.startsWith('void:draft:'))) return value;
  const data = JSON.parse(value);
  if (key.startsWith('void:draft:')) return JSON.stringify(normalizeReview(data));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Dados inválidos');
  return JSON.stringify(Object.fromEntries(Object.entries(data).map(([id, record]) => [id, normalizeReview(record)])));
}
export function setStorageUser(id) { activeUser = id || null; }
export function readAccount(storage, id) {
  const value = JSON.parse(storage.getItem(accountKey(id)) || '{"data":{},"pending":{}}');
  if (!value || !value.data || !value.pending || typeof value.data !== 'object' || typeof value.pending !== 'object'
    || Array.isArray(value.data) || Array.isArray(value.pending)) throw new Error('Cache inválido');
  for (const key of Object.keys(value.data)) value.data[key] = normalizeStored(key, value.data[key]);
  for (const row of Object.values(value.pending)) if (row.kind === 'review') row.payload = normalizeReview(row.payload);
  return value;
}
export function scopedStorage(storage, userId = activeUser) {
  if (!userId) return { getItem: key => normalizeStored(key, storage.getItem(key)),
    setItem: (key, value) => storage.setItem(key, normalizeStored(key, value)), removeItem: key => storage.removeItem(key) };
  function write(key, value) {
    value = normalizeStored(key, value);
    const state = readAccount(storage, userId);
    const kind = key === REVIEWS_KEY ? 'review' : key === LIST_KEY ? 'library' : key === MOVIES_KEY ? 'watchlist' : key===SERIES_KEY?'series_watchlist':key===ANIMES_KEY?'anime_watchlist':null;
    if (kind) {
      const before = JSON.parse(state.data[key] || '{}');
      const after = JSON.parse(value || '{}');
      if (!after || Array.isArray(after) || typeof after !== 'object') throw new Error('Dados inválidos');
      for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (JSON.stringify(before[id]) !== JSON.stringify(after[id])) {
          state.pending[`${kind}:${id}`] = { kind, item_key: id, payload: after[id] ? ['watchlist','series_watchlist','anime_watchlist'].includes(kind) ? { item: after[id] } : after[id] : null };
        }
      }
    }
    if (value === null) delete state.data[key]; else state.data[key] = value;
    // Cache e fila são gravados em uma única operação para evitar salvamentos parciais.
    storage.setItem(accountKey(userId), JSON.stringify(state));
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(DATA_EVENT));
  }
  return { getItem: key => readAccount(storage, userId).data[key] ?? null,
    setItem: (key, value) => write(key, String(value)), removeItem: key => write(key, null) };
}

export function mergeCloud(storage, userId, rows) {
  const state = readAccount(storage, userId);
  const reviews = JSON.parse(state.data[REVIEWS_KEY] || '{}');
  const library = JSON.parse(state.data[LIST_KEY] || '{}');
  const movies = JSON.parse(state.data[MOVIES_KEY] || '{}');
  const series = JSON.parse(state.data[SERIES_KEY] || '{}');
  const animes = JSON.parse(state.data[ANIMES_KEY] || '{}');
  for (const row of rows) {
    if (row.user_id !== userId || !['review', 'library', 'watchlist','series_watchlist','anime_watchlist'].includes(row.kind)) continue;
    if (state.pending[`${row.kind}:${row.item_key}`]) continue;
    const target = row.kind === 'review' ? reviews : row.kind === 'watchlist' ? movies : row.kind==='series_watchlist'?series:row.kind==='anime_watchlist'?animes:library;
    if (row.payload === null) delete target[row.item_key];
    else target[row.item_key] = ['watchlist','series_watchlist','anime_watchlist'].includes(row.kind) ? row.payload.item : row.payload;
  }
  state.data[REVIEWS_KEY] = JSON.stringify(reviews);
  state.data[LIST_KEY] = JSON.stringify(library);
  state.data[MOVIES_KEY] = JSON.stringify(movies);
  state.data[SERIES_KEY] = JSON.stringify(series);
  state.data[ANIMES_KEY] = JSON.stringify(animes);
  storage.setItem(accountKey(userId), JSON.stringify(state));
}

export async function syncAccount(client, storage, userId, pull = false, prepareMovie = prepareMovieReview) {
  storage = accountGenerationStorage(storage, userId);
  // Upgrade lists saved before cloud watchlists existed, once per account.
  const upgrade = readAccount(storage, userId);
  if (!upgrade.movieWatchlistCloudV1) {
    for (const [id, movie] of Object.entries(JSON.parse(upgrade.data[MOVIES_KEY] || '{}'))) {
      if (!/^[1-9][0-9]*$/.test(id) || movie?.categoria !== 'filmes' || String(movie.id) !== id) continue;
      if (!upgrade.pending[`watchlist:${id}`]) upgrade.pending[`watchlist:${id}`] = { kind: 'watchlist', item_key: id, payload: { item: movie } };
    }
    upgrade.movieWatchlistCloudV1 = true;
    storage.setItem(accountKey(userId), JSON.stringify(upgrade));
  }
  const snapshot = readAccount(storage, userId).pending;
  const pending = Object.values(snapshot);
  let releaseError;
  if (pending.length) {
    const movieIds = [...new Set(pending.filter(row => row.kind === 'review' && row.payload && /^filmes:/.test(row.item_key)).map(row => row.item_key.split(':')[1]))];
    const rejected = new Set();
    for (const id of movieIds) { try { await prepareMovie(client, id, userId); } catch (error) { rejected.add(`review:filmes:${id}`); releaseError ||= error; } }
    const accepted = pending.filter(row => !rejected.has(`${row.kind}:${row.item_key}`));
    if (accepted.length) {
      const { error } = await client.from('void_records').upsert(accepted.map(row => ({ ...row, user_id: userId })), { onConflict: 'user_id,kind,item_key' });
      if (error) throw error;
    }
    const current = readAccount(storage, userId);
    for (const [key, value] of Object.entries(snapshot)) {
      if (!rejected.has(key) && JSON.stringify(current.pending[key]) === JSON.stringify(value)) delete current.pending[key];
    }
    storage.setItem(accountKey(userId), JSON.stringify(current));
  }
  if (pull) {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client.from('void_records').select('user_id,kind,item_key,payload').eq('user_id', userId).order('kind').order('item_key').range(offset, offset + 499);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 500) break;
    }
    mergeCloud(storage, userId, rows);
  }
  if (releaseError) throw releaseError;
  return Object.keys(readAccount(storage, userId).pending).length;
}

export function importGuest(storage, userId) {
  const account = scopedStorage(storage, userId);
  let count = 0;
  for (const key of [REVIEWS_KEY, LIST_KEY, MOVIES_KEY,SERIES_KEY,ANIMES_KEY]) {
    const guest = JSON.parse(storage.getItem(key) || '{}');
    const current = JSON.parse(account.getItem(key) || '{}');
    if (!guest || typeof guest !== 'object' || Array.isArray(guest)) throw new Error('Dados locais inválidos');
    for (const [id, raw] of Object.entries(guest)) {
      const value = key === REVIEWS_KEY ? normalizeReview(raw) : raw;
      const item = key === MOVIES_KEY||key===SERIES_KEY||key===ANIMES_KEY ? value : value?.item;
      if (!item || !['filmes', 'series', 'animes', 'jogos'].includes(item.categoria)
        || !/^[1-9][0-9]*$/.test(String(item.id)) || typeof item.titulo !== 'string') continue;
      if (key === REVIEWS_KEY && (id !== `${item.categoria}:${item.id}` || !Number.isFinite(value.nota)
        || !Number.isFinite(parseRating(value.nota)) || (value.texto || '').length > 2000)) continue;
      if (key === LIST_KEY && (item.categoria !== 'jogos' || String(item.id) !== id
        || !['want', 'playing', 'finished', 'paused'].includes(value.status))) continue;
      if (key === MOVIES_KEY && (item.categoria !== 'filmes' || String(item.id) !== id)) continue;
      if(key===ANIMES_KEY&&(item.categoria!=='animes'||String(item.id)!==id))continue;
      if (key === SERIES_KEY && (item.categoria !== 'series' || String(item.id) !== id)) continue;
      if (!Object.hasOwn(current, id)) { current[id] = value; count++; }
    }
    account.setItem(key, JSON.stringify(current));
  }
  return count;
}
