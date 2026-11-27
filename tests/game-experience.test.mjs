import test from 'node:test';
import assert from 'node:assert/strict';
import { completeGameReview, gameReviewForm } from '../lib/game-review.js';
import { gameStatusKey, setGameStatus, readLibrary, LIBRARY_KEY } from '../lib/library.js';
import { scopedStorage, REVIEWS_KEY, LIST_KEY, readAccount } from '../lib/account-storage.js';
import { homeContinue } from '../lib/home-catalog.js';
import { loadGameReviews } from '../lib/game-community.js';
import { quickGameReview } from '../lib/game-hero.js';

const now = new Date('2026-10-23T15:00:00Z');
const item = { id: 3328, titulo: 'Jogo', categoria: 'jogos', estreia: '2015-05-18' };
const storage = () => { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k) }; };

test('extended game reviews preserve privacy, original ratings and unknown saved fields', () => {
  const prior = { nota: 4.2, texto: 'Original', public: false, favorito: true, originalRating: { value: 8.4, scale: 10 }, legacy: 'keep' };
  const form = { ...gameReviewForm(prior, true, now), nota: '0', recommendation: 'no', positives: '  Mundo  ', negatives: 'Combate', spoiler: true };
  const record = completeGameReview(item, prior, form, true, now);
  assert.equal(record.nota, 0); assert.equal(record.public, false); assert.equal(record.ratingScale, 5);
  assert.equal(record.positives, 'Mundo'); assert.equal(record.recommendation, 'no'); assert.equal(record.legacy, 'keep');
  assert.deepEqual(record.originalRating, prior.originalRating); assert.equal(record.spoiler, true);
  const quick = quickGameReview(item, record, 4.7, true, now);
  assert.equal(quick.positives, record.positives); assert.equal(quick.negatives, record.negatives);
  assert.equal(quick.recommendation, record.recommendation); assert.equal(quick.public, false);
  assert.equal(gameReviewForm(null, true, now).public, true);
  assert.equal(gameReviewForm({ public: true }, false, now).public, false);
  assert.equal(completeGameReview(item, null, { ...form, public: true }, false, now).public, false);
});

test('drafts accept an unset rating while publishing validates launch, decimal rating and date', () => {
  const form = { ...gameReviewForm(null, false, now), nota: '', positives: 'x'.repeat(700), recommendation: 'invalid' };
  const draft = completeGameReview(item, null, form, false, now, true);
  assert.equal(draft.nota, ''); assert.equal(draft.positives.length, 500); assert.equal(draft.recommendation, '');
  assert.throws(() => completeGameReview(item, null, form, false, now), /INVALID_REVIEW/);
  assert.throws(() => completeGameReview({ ...item, estreia: '2027-01-01' }, null, { ...form, nota: 5 }, false, now), /GAME_UNRELEASED/);
  assert.throws(() => completeGameReview(item, null, { ...form, nota: 5.1 }, true, now), /INVALID_REVIEW/);
  assert.throws(() => completeGameReview(item, null, { ...form, nota: 4.21 }, true, now), /INVALID_REVIEW/);
  assert.throws(() => completeGameReview(item, null, { ...form, nota: 4, data: '2027-01-01' }, true, now), /INVALID_REVIEW/);
});

test('six library choices round trip through the existing private records without invalidating legacy clients', () => {
  const store = storage();
  assert.equal(gameStatusKey(undefined), '');
  for (const choice of ['want', 'playing', 'paused', 'finished', 'platinum', 'abandoned']) {
    setGameStatus(store, item, choice);
    const record = readLibrary(store)[item.id];
    assert.equal(gameStatusKey(record), choice);
    assert.ok(['want','playing','paused','finished'].includes(record.status));
  }
  assert.equal(homeContinue(readLibrary(store)).length, 0);
  setGameStatus(store, item, 'playing');
  assert.equal(readLibrary(store)[item.id].statusDetail, undefined);
  assert.equal(homeContinue(readLibrary(store)).length, 1);
  store.setItem(LIBRARY_KEY, JSON.stringify({ [item.id]: { item, status: 'paused', statusDetail: 'platinum' } }));
  assert.equal(gameStatusKey(readLibrary(store)[item.id]), 'paused');
});

test('extended review/status metadata enters only the owning account queue and preserves tombstones', () => {
  const store = storage(), account = scopedStorage(store, 'account-a');
  const record = completeGameReview(item, null, { ...gameReviewForm(null, true, now), nota: 4.7, recommendation: 'yes', positives: 'Mundo' }, true, now);
  account.setItem(REVIEWS_KEY, JSON.stringify({ 'jogos:3328': record }));
  setGameStatus({ getItem: () => account.getItem(LIST_KEY), setItem: (_, value) => account.setItem(LIST_KEY, value) }, item, 'platinum');
  const data = readAccount(store, 'account-a');
  assert.equal(data.pending['review:jogos:3328'].payload.recommendation, 'yes');
  assert.equal(data.pending['library:3328'].payload.status, 'finished');
  assert.equal(data.pending['library:3328'].payload.statusDetail, 'platinum');
  assert.deepEqual(readAccount(store, 'account-b').pending, {});
  assert.equal(store.getItem(REVIEWS_KEY), null);
  account.setItem(REVIEWS_KEY, '{}');
  assert.equal(readAccount(store, 'account-a').pending['review:jogos:3328'].payload, null);
});

test('rating sorting happens on the server before pagination and explicitly requests only public game reviews', async () => {
  const calls = [];
  const builder = { then(resolve) { return Promise.resolve({ data: [{ user_id: 'author', payload: { nota: 0, texto: 'Review', recommendation: 'no' }, updated_at: '2026-10-23' }], count: 27 }).then(resolve); } };
  for (const method of ['select','eq','not','order','range']) builder[method] = (...args) => { calls.push([method,...args]); return builder; };
  const client = { from: name => { calls.push(['from',name]); return builder; }, rpc: async (name,args) => { assert.equal(name,'void_identities'); assert.deepEqual(args.ids,['author']); return { data: [{user_id:'author',username:'pessoa'}] }; } };
  const result = await loadGameReviews(client, 3328, { sort: 'lowest', offset: 20 });
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'item_key' && call[2] === 'jogos:3328'));
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'is_public' && call[2] === true));
  assert.ok(calls.some(call => call[0] === 'order' && call[1] === 'payload->nota' && call[2].ascending));
  assert.ok(calls.findIndex(call => call[0] === 'order') < calls.findIndex(call => call[0] === 'range'));
  assert.deepEqual(calls.at(-1), ['range',20,39]);
  assert.equal(result.total,27); assert.equal(result.rows[0].rating,0); assert.equal(result.rows[0].username,'pessoa');
});
