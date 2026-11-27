import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendedGames, loadRecommendedGames, gamePreferences, recommendationWindow, RECOMMENDED_CARD_COUNT, RECOMMENDED_SOURCE_PAGES } from '../lib/game-recommendations.js';
import { recentRecommendationCandidates } from '../lib/game-recommendation-source.js';
import { gameFriendSignals } from '../lib/game-recommendation-friends.js';

const game = (id, nota = 4, extra = {}) => ({ id, nota, titulo: `Game ${id}`, categoria: 'jogos', estreia: '2025-01-01', plataformas: ['PC'], ...extra });
const response = (jogos, hasNext = false) => ({ ok: true, json: async () => ({ jogos, pagination: { hasNext } }) });

test('recommendations exclude highlighted IDs and normalized titles, deduplicate, filter and sort without mutating catalogue data', () => {
  const pool = [game(1, 4.5), game(2, 5), game(3, null), game(4, 0), game(5, 4.9, { plataformas: ['Nintendo'] }), game(1, 4.5), game(6, 5, { titulo: 'Featured: Game' }), game(7, 4.2)];
  const before = structuredClone(pool);
  const chosen = recommendedGames(pool, { excluded: [{ id: '2' }, { title: 'Featured Game' }], platform: 'PC', limit: 10 });
  assert.deepEqual(chosen.map(item => item.id), [1, 7, 4, 3]);
  assert.deepEqual(pool, before);
  assert.deepEqual(recommendedGames(pool, { platform: 'Nintendo' }).map(item => item.id), [5]);
  assert.equal(chosen.at(-1).nota, null);
  assert.equal(recommendedGames(Array.from({ length: 30 }, (_, i) => game(i + 1))).length, RECOMMENDED_CARD_COUNT);
});

test('recommendations use a bounded popular RAWG catalogue pool and stop when pagination ends', async () => {
  const urls = [];
  const data = await loadRecommendedGames('Xbox', { fetcher: async url => {
    urls.push(url); const parsed = new URL(url, 'https://void.test');
    assert.equal(parsed.pathname, '/api/game-recommendations');
    assert.equal(parsed.searchParams.get('platform'), 'Xbox');
    return response([game(Number(parsed.searchParams.get('page')))], true);
  } });
  assert.equal(urls.length, RECOMMENDED_SOURCE_PAGES);
  assert.equal(data.games.length, RECOMMENDED_SOURCE_PAGES);
  assert.equal(data.partial, false);
  let calls = 0;
  await loadRecommendedGames('all', { fetcher: async () => { calls++; return response([]); } });
  assert.equal(calls, 1);
});

test('recent source applies release dates, votes and popularity without exposing credentials', async () => {
  const row = { id: 1, name: 'Recent success', released: '2025-04-20', background_image: 'https://media.rawg.io/example.jpg', rating: 4.3, ratings_count: 100, added: 800 };
  const data = await recentRecommendationCandidates({ key: 'fixture-secret', now: new Date('2026-10-24T12:00:00Z'), platform: 'Nintendo', genre: 'indie', fetcher: async url => {
    assert.equal(url.searchParams.get('dates'), '2023-10-24,2026-10-24');
    assert.equal(url.searchParams.get('parent_platforms'), '7');
    assert.equal(url.searchParams.get('genres'), 'indie');
    assert.equal(url.searchParams.get('ordering'), '-added');
    return { results: [row, { ...row, id: 2, released: '2011-01-01' }, { ...row, id: 3, released: '2028-01-01' }, { ...row, id: 4, ratings_count: 2 }, { ...row, id: 5, rating: 2 }, { ...row, id: 6, added: 1 }, { ...row, id: 7, released: '2025' }] };
  } });
  assert.deepEqual(data.jogos.map(item => item.id), [1]);
  assert.equal(JSON.stringify(data).includes('fixture-secret'), false);
  assert.equal(recommendationWindow(new Date('2024-02-29T12:00:00Z')).from, '2021-02-28');
});

test('own positive reviews and authorized friend signals prioritize recent matches, excluding already rated and old games', () => {
  const preferences = gamePreferences({ a: { item: game(1, 4, { generos: ['RPG'] }), nota: '4,5' }, b: { item: game(2), nota: 0 }, c: { item: { categoria: 'filmes', id: 99 }, nota: 5 } });
  assert.deepEqual(preferences.played, ['1', '2']); assert.deepEqual(preferences.genres, ['role-playing-games-rpg']);
  const pool = [game(1), game(2), game(3, 4.8), game(4, 4, { generos: ['RPG'] }), game(5, 4), game(6, 5, { estreia: '2011-01-01' }), game(7, 5, { estreia: '2028-01-01' })];
  const result = recommendedGames(pool, { preferences, friends: [{ item: game(5), rating: '4,2' }], now: new Date('2026-10-24T12:00:00Z') });
  assert.deepEqual(result.map(item => item.id), [5, 4, 3]);
  assert.equal(result[0].recommendationReason, 'Bem avaliado por amigos');
  assert.equal(result[1].recommendationReason, 'Parecido com jogos que você gostou');
  assert.equal(recommendedGames(pool, { now: new Date('2026-10-24T12:00:00Z') }).some(item => item.recommendationReason), false);
});

test('friend signals use the existing authenticated feed, discard other media/low ratings and return no reviewer data', async () => {
  let calls = 0;
  const client = { rpc(name, args) {
    assert.equal(name, 'void_friend_activity'); assert.equal(args.latest, false); calls++;
    return { abortSignal: async () => ({ data: { rows: [{ item_key: 'jogos:50', rating: 4.5, text: 'private to this request', user_id: 'friend' }, { item_key: 'filmes:51', rating: 5 }, { item_key: 'jogos:52', rating: 0 }, { item_key: 'jogos:53', rating: '' }], has_more: false } }) };
  } };
  const result = await gameFriendSignals(client, new AbortController().signal);
  assert.equal(calls, 1); assert.deepEqual(result, [{ rating: 4.5, item: { id: '50', categoria: 'jogos' } }]);
  const unavailable = { rpc: () => ({ abortSignal: async () => ({ error: new Error('DENIED') }) }) };
  await assert.rejects(() => gameFriendSignals(unavailable, new AbortController().signal), /DENIED/);
});

test('recommendation errors are explicit, partial data survives a later page failure and cancellation propagates', async () => {
  await assert.rejects(() => loadRecommendedGames('all', { fetcher: async () => ({ ok: false }) }), /RECOMMENDATIONS_UNAVAILABLE/);
  let calls = 0;
  const partial = await loadRecommendedGames('PC', { fetcher: async () => ++calls === 1 ? response([game(1)], true) : { ok: false } });
  assert.equal(partial.partial, true); assert.deepEqual(partial.games.map(item => item.id), [1]);
  const controller = new AbortController(); calls = 0;
  await assert.rejects(() => loadRecommendedGames('PC', { signal: controller.signal, fetcher: async () => {
    if (++calls === 1) return response([game(1)], true);
    controller.abort(); throw new Error('CANCELLED');
  } }), /CANCELLED/);
});
