import { loadFriendActivity } from './friend-activity.js';
import { parseRating } from './ratings.js';
import { PERSONAL_MIN_RATING } from './game-recommendations.js';

export const FRIEND_SIGNAL_PAGES = 3;
export const FRIEND_GAME_LIMIT = 4;
// Existing authenticated, security-invoker feed enforces accepted friendships,
// public review visibility, profile visibility and tombstones on the server.
export async function gameFriendSignals(client, signal) {
  const found = new Map(); let cursor = null;
  for (let page = 0; page < FRIEND_SIGNAL_PAGES; page++) {
    const result = await loadFriendActivity(client, { cursor, signal });
    if (signal?.aborted) throw new Error('ABORTED');
    for (const row of result.rows) {
      const match = /^jogos:([1-9]\d*)$/.exec(row.item_key || '');
      if (!match || parseRating(row.rating) < PERSONAL_MIN_RATING || !Number.isFinite(parseRating(row.rating))) continue;
      const id = match[1];
      if (!found.has(id)) found.set(id, { rating: parseRating(row.rating), item: { id, categoria: 'jogos' } });
    }
    if (!result.has_more || !result.cursor || found.size >= FRIEND_GAME_LIMIT) break;
    cursor = result.cursor;
  }
  return [...found.values()].slice(0, FRIEND_GAME_LIMIT);
}
