/** @typedef {{getItem(key: string): string|null, setItem(key: string,value: string): void, removeItem(key: string): void}} StorageLike */

/** @type {Map<string, number>} */
const generations = new Map();

/**
 * Bind all synchronization entry points, including callers outside the provider,
 * to the account's cache generation. No token or private payload is stored here.
 * @param {StorageLike} storage
 * @param {string} userId
 * @returns {StorageLike}
 */
export function accountGenerationStorage(storage, userId) {
  const generation = generations.get(userId) || 0;
  return currentAccountStorage(storage, () => (generations.get(userId) || 0) === generation);
}

/**
 * Drop synchronized private cache at sign-out/account switch. Preserve only
 * unsent records and drafts, so a lost connection never silently deletes work.
 * @param {StorageLike} storage
 * @param {string} userId
 * @returns {{pending: number, drafts: number}}
 */
export function pruneAccountCache(storage, userId) {
  generations.set(userId, (generations.get(userId) || 0) + 1);
  storage.removeItem(`void:people-recent:${userId}:v1`);
  const key = `void:account:${userId}:v1`;
  const raw = storage.getItem(key);
  if (!raw) return { pending: 0, drafts: 0 };
  const state = JSON.parse(raw);
  if (
    !state ||
    !state.data ||
    !state.pending ||
    Array.isArray(state.data) ||
    Array.isArray(state.pending)
  ) {
    // Preserve an unreadable offline queue for explicit recovery rather than
    // treating a parse/schema error as permission to destroy user data.
    throw new Error('Invalid account cache.');
  }
  /** @type {Readonly<Record<string, string>>} */
  const kinds = {
    review: 'void:reviews:v1',
    library: 'void:library:v1',
    watchlist: 'void:movie-watchlist:v1',
    series_watchlist: 'void:series-watchlist:v1',
    anime_watchlist: 'void:anime-watchlist:v1',
  };
  /** @type {Record<string,string>} */
  const data = {};
  let drafts = 0;
  for (const [name, value] of Object.entries(state.data)) {
    if (name.startsWith('void:draft:')) {
      data[name] = String(value);
      drafts++;
    }
  }
  for (const row of Object.values(state.pending)) {
    const name = Object.hasOwn(kinds, row.kind) ? kinds[row.kind] : null;
    if (!name || !row.payload) continue;
    const records = JSON.parse(data[name] || '{}');
    records[row.item_key] = ['watchlist', 'series_watchlist', 'anime_watchlist'].includes(row.kind)
      ? row.payload.item
      : row.payload;
    data[name] = JSON.stringify(records);
  }
  const pending = Object.keys(state.pending).length;
  if (!pending && !drafts) storage.removeItem(key);
  else storage.setItem(key, JSON.stringify({ ...state, data }));
  return { pending, drafts };
}

/**
 * Prevent an asynchronous sync started before sign-out from repopulating cache.
 * @param {StorageLike} storage
 * @param {() => boolean} isCurrent
 * @returns {StorageLike}
 */
export function currentAccountStorage(storage, isCurrent) {
  function check() {
    if (!isCurrent()) throw new Error('ACCOUNT_CHANGED');
  }
  return {
    getItem(key) {
      check();
      return storage.getItem(key);
    },
    setItem(key, value) {
      check();
      storage.setItem(key, value);
    },
    removeItem(key) {
      check();
      storage.removeItem(key);
    },
  };
}
