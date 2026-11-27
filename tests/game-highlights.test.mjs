import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGameHighlights } from '../lib/game-highlights.js';
import { gameBanners } from '../lib/game-banners.js';
import handler from '../pages/api/game-highlights.js';

test('hype uses dated RAWG popularity, deduplicates and rejects unillustrated/old/unknown games', async t => {
  const previous = process.env.RAWG_API_KEY;
  process.env.RAWG_API_KEY = 'fixture';
  t.after(() => { if (previous === undefined) delete process.env.RAWG_API_KEY; else process.env.RAWG_API_KEY = previous; });
  const row = { id: 1, name: 'Recent', released: '2026-10-01', added: 100, background_image: 'https://example.com/art.jpg', rating: 4.5, ratings_count: 2 };
  const result = await loadGameHighlights({ now: new Date('2026-10-22T12:00:00Z'), fetcher: async url => {
    assert.equal(url.searchParams.get('ordering'), '-added');
    assert.equal(url.searchParams.get('dates'), '2025-10-22,2027-04-20');
    return { results: [row, row, { ...row, id: 2, added: 300, name: 'Upcoming', released: '2027-01-10' }, { ...row, id: 3, released: '2018-01-01' }, { ...row, id: 4, background_image: null }, { ...row, id: 5, added: 0 }, { ...row, id: 6, released: null }] };
  } });
  assert.deepEqual(result.games.map(game => game.id), [2, 1]);
  assert.equal(result.games[0].nota, 4.5);
  assert.equal(result.games[0].categoria, 'jogos');
  assert.ok(!JSON.stringify(result).includes('fixture'));
});

test('GTA VI stays first, duplicate GTA is omitted, and custom art/logo is reused for matching trending games', () => {
  const first = { id: 'gta-vi', background: '/gta.jpg' };
  const config = [first, { item: { id: 2 }, logo: '/custom.png', background: '/custom.jpg' }];
  const games = [{ id: 1, categoria: 'jogos', titulo: 'Grand Theft Auto VI' }, { id: 2, categoria: 'jogos', titulo: 'Trending', poster: '/provider.jpg' }];
  const banners = gameBanners(config, games);
  assert.equal(banners[0], first);
  assert.equal(banners.length, 2);
  assert.equal(banners[1].logo, '/custom.png');
  assert.equal(banners[1].primary.href, '/obra/jogos/2');
  assert.deepEqual(gameBanners(config, []), [first]);
});

test('empty selection stays empty and unavailable configuration is an explicit uncached API error', async t => {
  const previous = process.env.RAWG_API_KEY;
  t.after(() => { if (previous === undefined) delete process.env.RAWG_API_KEY; else process.env.RAWG_API_KEY = previous; });
  process.env.RAWG_API_KEY = 'fixture';
  assert.deepEqual((await loadGameHighlights({ fetcher: async () => ({ results: [] }) })).games, []);
  delete process.env.RAWG_API_KEY;
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
  await handler({ method: 'GET' }, res);
  assert.equal(res.code, 503);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  await handler({ method: 'POST' }, res);
  assert.equal(res.code, 405);
});

test('recent and upcoming windows keep past and future releases separate', async t => {
  const previous = process.env.RAWG_API_KEY;
  process.env.RAWG_API_KEY = 'fixture';
  t.after(() => { if (previous === undefined) delete process.env.RAWG_API_KEY; else process.env.RAWG_API_KEY = previous; });
  const now = new Date('2026-10-22T12:00:00Z');
  const row = { name: 'Game', added: 10, background_image: 'https://example.com/art.jpg' };
  const fetcher = async () => ({ results: [{ ...row, id: 1, released: '2026-10-22' }, { ...row, id: 2, released: '2026-10-23' }, { ...row, id: 3, released: '2026-09-01' }] });
  assert.deepEqual((await loadGameHighlights({ now, fetcher, mode: 'recent' })).games.map(game => game.id), [1]);
  const upcoming = await loadGameHighlights({ now, fetcher, mode: 'upcoming' });
  assert.deepEqual(upcoming.games.map(game => game.id), [2]);
  assert.equal(upcoming.games[0].estreia, '2026-10-23');
});
