import test from 'node:test';
import assert from 'node:assert/strict';
import { readLibrary, setGameStatus, setGameDates, LIBRARY_KEY } from '../lib/library.js';
import { journeyDateValue, journeyTimestamp, formatJourneyDate, shouldOfferFinishReview, skipFinishReview } from '../lib/game-journey.js';
import { saveReviewRecord } from '../lib/review-save.js';
import { gameReviewForm } from '../lib/game-review.js';
import { scopedStorage, readAccount, syncAccount, REVIEWS_KEY } from '../lib/account-storage.js';

const game = { id: 42, titulo: 'Jogo', categoria: 'jogos', estreia: '2020-01-01' };
const now = new Date('2026-10-26T15:00:00Z'), later = new Date('2026-10-27T16:00:00Z');
function storage() { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }; }

test('status transitions initialize start once, finish without inventing start, and clear finish on replay', () => {
  const store = storage();
  setGameStatus(store, game, 'playing', now);
  assert.equal(readLibrary(store)[42].started_at, now.toISOString());
  setGameStatus(store, game, 'playing', later);
  assert.equal(readLibrary(store)[42].started_at, now.toISOString());
  setGameStatus(store, game, 'finished', later);
  assert.equal(readLibrary(store)[42].finished_at, later.toISOString());
  setGameStatus(store, game, 'playing', later);
  assert.equal(readLibrary(store)[42].finished_at, null);
  assert.equal(readLibrary(store)[42].started_at, now.toISOString());
  setGameStatus(store, { ...game, id: 43 }, 'platinum', later);
  assert.equal(readLibrary(store)[43].started_at, null);
  assert.equal(readLibrary(store)[43].finished_at, later.toISOString());
});

test('legacy completed games remain undated until a transition or explicit date edit, retaining unknown metadata', () => {
  const store = storage();
  store.setItem(LIBRARY_KEY, JSON.stringify({ 42: { item: game, status: 'finished', custom: 'keep' } }));
  assert.equal(readLibrary(store)[42].finished_at, undefined);
  setGameStatus(store, game, 'finished', now);
  assert.equal(readLibrary(store)[42].finished_at, null);
  assert.equal(readLibrary(store)[42].custom, 'keep');
  setGameDates(store, game, { started_at: '2026-10-12', finished_at: '2026-10-20' }, now);
  assert.equal(journeyDateValue(readLibrary(store)[42].started_at), '2026-10-12');
  assert.equal(formatJourneyDate(readLibrary(store)[42].finished_at), '20 out 2026');
  setGameStatus(store, game, 'paused', later);
  assert.equal(journeyDateValue(readLibrary(store)[42].finished_at), '2026-10-20');
  setGameDates(store, game, { finished_at: '' }, later);
  assert.equal(readLibrary(store)[42].finished_at, null);
  assert.equal(journeyDateValue(readLibrary(store)[42].started_at), '2026-10-12');
  const original = store.getItem(LIBRARY_KEY);
  assert.throws(() => setGameDates(store, game, { started_at: '2026-02-30' }), /INVALID_JOURNEY_DATE/);
  assert.equal(store.getItem(LIBRARY_KEY), original);
  assert.equal(journeyTimestamp(''), null); assert.equal(formatJourneyDate(null), '');
  assert.equal(journeyDateValue('2026-10-13T01:00:00Z'), '2026-10-12');
});

test('journey timestamps travel in the same owner queue, survive two-device sync and preserve tombstones', async () => {
  const deviceA = storage(), deviceB = storage(), remote = new Map();
  const account = scopedStorage(deviceA, 'a');
  setGameStatus(account, game, 'playing', now);
  setGameDates(account, game, { started_at: '2020-01-02' }, now);
  const client = { from() { return {
    async upsert(rows) { for (const row of rows) remote.set(row.user_id + row.item_key, row); return {}; },
    select() { return { eq(_, owner) { return { order() { return this; }, async range() { return { data: [...remote.values()].filter(row => row.user_id === owner) }; } }; } }; },
  }; } };
  await syncAccount(client, deviceA, 'a'); await syncAccount(client, deviceB, 'a', true);
  assert.equal(readLibrary(scopedStorage(deviceB, 'a'))[42].started_at, '2020-01-02T12:00:00.000Z');
  assert.deepEqual(readLibrary(scopedStorage(deviceB, 'b')), {});
  assert.equal(deviceA.getItem(LIBRARY_KEY), null);
  setGameStatus(account, game, '', later);
  assert.equal(readAccount(deviceA, 'a').pending['library:42'].payload, null);
  await syncAccount(client, deviceA, 'a'); await syncAccount(client, deviceB, 'a', true);
  assert.deepEqual(readLibrary(scopedStorage(deviceB, 'a')), {});
});

test('finish prompt ignores existing reviews including zero and respects session suppression per game and owner', () => {
  const session = storage();
  assert.equal(shouldOfferFinishReview(session, 'a', game, 'finished', 'playing', {}), true);
  assert.equal(shouldOfferFinishReview(session, 'a', game, 'platinum', 'finished', { 'jogos:42': { nota: 0 } }), false);
  assert.equal(shouldOfferFinishReview(session, 'a', game, 'finished', 'finished', {}), false);
  assert.equal(shouldOfferFinishReview(session, 'a', game, 'paused', 'playing', {}), false);
  skipFinishReview(session, 'a', game.id);
  assert.equal(shouldOfferFinishReview(session, 'a', game, 'finished', 'playing', {}), false);
  assert.equal(shouldOfferFinishReview(session, 'b', game, 'finished', 'playing', {}), true);
  assert.equal(shouldOfferFinishReview(session, 'a', { ...game, id: 43 }, 'platinum', 'playing', {}), true);
});

test('shared review save validates game rules, saves zero, clears drafts and never overwrites a concurrent review', () => {
  const store = storage(), account = scopedStorage(store, 'owner');
  const form = { ...gameReviewForm(null, true, now), nota: 0, texto: 'Review', spoiler: true };
  saveReviewRecord({ storage: account, item: game, form, signedIn: true, draft: true, now });
  assert.deepEqual(readAccount(store, 'owner').pending, {});
  const saved = saveReviewRecord({ storage: account, item: game, form, signedIn: true, onlyIfUnreviewed: true, now });
  assert.equal(saved.record.nota, 0); assert.equal(saved.record.public, true);
  assert.equal(account.getItem('void:draft:jogos:42'), null);
  assert.equal(readAccount(store, 'owner').pending['review:jogos:42'].payload.nota, 0);
  const repeated = saveReviewRecord({ storage: account, item: game, form: { ...form, nota: 5 }, signedIn: true, onlyIfUnreviewed: true, now });
  assert.equal(repeated.alreadyReviewed, true); assert.equal(repeated.record.nota, 0);
  const initial = account.getItem(REVIEWS_KEY);
  assert.throws(() => saveReviewRecord({ storage: account, item: game, form: { ...form, nota: 5.5 }, signedIn: true, now }), /INVALID_REVIEW/);
  assert.throws(() => saveReviewRecord({ storage: account, item: { ...game, estreia: '2027-01-01' }, form, signedIn: true, now }), /GAME_UNRELEASED/);
  assert.equal(account.getItem(REVIEWS_KEY), initial);
  const guest = saveReviewRecord({ storage: scopedStorage(store, null), item: game, form, signedIn: false, now });
  assert.equal(guest.record.public, false);
});
