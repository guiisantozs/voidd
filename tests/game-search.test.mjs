// Explicitly exercise the retained RAWG adapter; IGDB has its own fixtures.
process.env.GAME_CATALOG_PROVIDER = 'rawg';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGameSearch, searchGames } from '../lib/game-search.js';
import { hasGenre } from '../lib/game-filters.js';
import handler from '../pages/api/jogos.js';

function setup(t, body, status = 200) {
  const before = process.env.RAWG_API_KEY;
  process.env.RAWG_API_KEY = 'test-key';
  t.after(() => { if (before === undefined) delete process.env.RAWG_API_KEY; else process.env.RAWG_API_KEY = before; });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    calls.push(new URL(url));
    return { ok: status === 200, status, json: async () => body };
  });
  return calls;
}
const response = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

test('RAWG authentication refusal becomes a sanitized uncached configuration error', async t => {
  setup(t, { error: 'private provider diagnostic' }, 401);
  const res = response();
  await handler({ method: 'GET', query: {q: 'Hollow Knight'} }, res);
  assert.equal(res.code, 503);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.body.code, 'GAME_CATALOG_CONFIGURATION');
  assert.ok(!JSON.stringify(res.body).includes('private provider diagnostic'));
});

test('year filter validates bounds and reaches RAWG as the full year date range', async t => {
  for (const year of ['1949', '2100', '20', '2026x']) assert.throws(() => parseGameSearch({ year }), /INVALID/);
  const calls = setup(t, { results: [] });
  await searchGames(parseGameSearch({ year: '2026' }));
  assert.equal(calls[0].searchParams.get('dates'), '2026-01-01,2026-12-31');
});

test('busca valida limites, valores repetidos e filtros permitidos', () => {
  assert.equal(parseGameSearch({ q: '  Elden Ring  ' }).q, 'Elden Ring');
  for (const input of [{ page: '0' }, { page: '501' }, { page: '-1' }, { page: '1.5' }, { q: ['a', 'b'] }, { q: 'a'.repeat(101) }, { platform: 'https://example.com' }, { order: 'unknown' }, { genre: 'unknown' }]) {
    assert.throws(() => parseGameSearch(input), /INVALID/);
  }
});
test('filtros e paginação são enviados à RAWG, sem expor a URL com chave', async t => {
  const calls = setup(t, { count: 50, next: 'https://api.rawg.io/api/games?key=secret&page=3', results: [{ id: 42, name: 'Jogo', rating: 4.5, ratings_count: 4 }] });
  const result = await searchGames(parseGameSearch({ q: 'D&D + ação', page: '2', platform: 'Nintendo', genre: 'action', order: 'rating' }));
  assert.equal(calls[0].searchParams.get('search'), 'D&D + ação');
  assert.equal(calls[0].searchParams.get('parent_platforms'), '7');
  assert.equal(calls[0].searchParams.get('genres'), 'action');
  assert.equal(calls[0].searchParams.get('ordering'), '-rating');
  assert.equal(calls[0].searchParams.get('page_size'), '18');
  assert.equal(calls[0].searchParams.get('page'), '2');
  assert.deepEqual(result.pagination, { page: 2, pageSize: 18, total: 50, hasNext: true });
  assert.equal(result.jogos[0].nota, 4.5);
  assert.ok(!JSON.stringify(result).includes('secret'));
  assert.ok(!JSON.stringify(result).includes('test-key'));
});
test('busca textual preserva relevância e última página encerra paginação', async t => {
  const calls = setup(t, { count: 1, next: null, results: [{ id: 1, name: 'Portal', rating: 0, ratings_count: 0 }] });
  const result = await searchGames(parseGameSearch({ q: 'portal' }));
  assert.equal(calls[0].searchParams.has('ordering'), false);
  assert.equal(result.pagination.hasNext, false);
  assert.equal(result.jogos[0].nota, null);
});
test('página fora do resultado é vazia e falhas do provedor não são mascaradas', async t => {
  setup(t, {}, 404);
  assert.deepEqual((await searchGames(parseGameSearch({ page: '5' }))).jogos, []);
});
test('rota recusa métodos e parâmetros antes de consultar o serviço', async () => {
  let res = response();
  await handler({ method: 'POST', query: {} }, res);
  assert.equal(res.code, 405);
  assert.equal(res.headers.Allow, 'GET');
  res = response();
  await handler({ method: 'GET', query: { page: ['1', '2'] } }, res);
  assert.equal(res.code, 400);
});
test('rota retorna cache no sucesso e erro sem cache para indisponibilidade', async t => {
  setup(t, { count: 0, results: [] });
  let res = response();
  await handler({ method: 'GET', query: {} }, res);
  assert.equal(res.code, 200);
  assert.match(res.headers['Cache-Control'], /s-maxage/);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 429 }));
  res = response();
  await handler({ method: 'GET', query: {} }, res);
  assert.equal(res.code, 429);
  assert.equal(res.headers['Retry-After'], '60');
  assert.equal(res.headers['Cache-Control'], 'no-store');
});
test('gêneros funcionam na biblioteca em português e nos dados do provedor', () => {
  assert.ok(hasGenre({ generos: ['Ação'] }, 'action'));
  assert.ok(hasGenre({ generos: ['Action'] }, 'action'));
  assert.ok(hasGenre({ generos: ['RPG'] }, 'role-playing-games-rpg'));
  assert.equal(hasGenre({ generos: ['Puzzle'] }, 'action'), false);
});
