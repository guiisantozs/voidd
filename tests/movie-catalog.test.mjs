import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearMovieCache, getMovieSection, MOVIE_CACHE_TTL, movieRequest } from '../lib/movie-catalog.js';
import { brazilDay, daysUntilRelease } from '../lib/movie-sections.js';
import { readMovieList, toggleMovie } from '../lib/movie-watchlist.js';
import handler from '../pages/api/filmes/[section].js';

function configured(t) {
  const previous = process.env.TMDB_API_KEY;
  process.env.TMDB_API_KEY = 'test-secret'; clearMovieCache();
  t.after(() => { clearMovieCache(); if (previous === undefined) delete process.env.TMDB_API_KEY; else process.env.TMDB_API_KEY = previous; });
}
const response = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

test('seleções usam os endpoints solicitados, pt-BR e região BR', () => {
  const paths = { hero: '/3/trending/movie/day', 'now-playing': '/3/movie/now_playing', upcoming: '/3/movie/upcoming', weekly: '/3/trending/movie/week', drama: '/3/discover/movie' };
  for (const [section, path] of Object.entries(paths)) {
    const url = movieRequest(section);
    assert.equal(url.pathname, path);
    assert.equal(url.searchParams.get('language'), 'pt-BR');
    assert.equal(url.searchParams.get('region'), 'BR');
  }
  assert.equal(movieRequest('classics').searchParams.get('primary_release_date.lte'), '1999-12-31');
  assert.equal(movieRequest('classics').searchParams.get('vote_count.gte'), '500');
  assert.equal(movieRequest('horror').searchParams.get('with_genres'), '27');
  assert.equal(movieRequest('scifi').searchParams.get('with_genres'), '878');
  assert.equal(movieRequest('animation').searchParams.get('with_genres'), '16');
  assert.throws(() => movieRequest('https://example.com'), /INVALID/);
  assert.throws(() => movieRequest('hero', 2), /INVALID/);
});
test('hero limita cinco filmes, notas são 0–5 e imagens usam tamanhos TMDB', async t => {
  configured(t);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ results: [
    { id: 99, title: 'Adulto', adult: true },
    ...Array.from({ length: 8 }, (_, id) => ({ id: id + 1, title: 'Filme', vote_average: 8, vote_count: 2, poster_path: '/p.jpg', backdrop_path: '/b.jpg' })),
  ] }) }));
  const data = await getMovieSection('hero');
  assert.equal(data.movies.length, 5);
  assert.equal(data.movies[0].nota, 4);
  assert.match(data.movies[0].poster, /w342\/p.jpg$/);
  assert.match(data.movies[0].backdrop, /w1280\/b.jpg$/);
  assert.ok(!JSON.stringify(data).includes('test-secret'));
});
test('cache compartilha requisições e expira após uma hora', async t => {
  configured(t);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return { ok: true, json: async () => ({ results: [] }) }; });
  await Promise.all([getMovieSection('weekly', 1, 100), getMovieSection('weekly', 1, 100)]);
  await getMovieSection('weekly', 1, 100 + MOVIE_CACHE_TTL - 1);
  assert.equal(calls, 1);
  await getMovieSection('weekly', 1, 100 + MOVIE_CACHE_TTL);
  assert.equal(calls, 2);
});
test('falha numa seção não bloqueia nem contamina o cache de outra', async t => {
  configured(t);
  let fail = true;
  t.mock.method(globalThis, 'fetch', async url => ({ ok: !(new URL(url).searchParams.get('with_genres') === '27' && fail), status: 503, json: async () => ({ results: [] }) }));
  await assert.rejects(getMovieSection('horror'));
  assert.deepEqual((await getMovieSection('drama')).movies, []);
  fail = false;
  assert.deepEqual((await getMovieSection('horror')).movies, []);
});
test('rota cacheia apenas sucesso por uma hora e valida parâmetros/métodos', async t => {
  configured(t);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ results: [], total_pages: 4 }) }));
  let res = response();
  await handler({ method: 'GET', query: { section: 'now-playing', page: '2' } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.page, 2);
  assert.equal(res.headers['Cache-Control'], 'public, max-age=0, s-maxage=3600');
  res = response();
  await handler({ method: 'GET', query: { section: ['hero', 'weekly'] } }, res);
  assert.equal(res.code, 400);
  res = response();
  await handler({ method: 'POST', query: {} }, res);
  assert.equal(res.code, 405);
  assert.equal(res.headers.Allow, 'GET');
  delete process.env.TMDB_API_KEY;
  res = response();
  await handler({ method: 'GET', query: { section: 'hero' } }, res);
  assert.equal(res.code, 503);
  assert.equal(res.headers['Cache-Control'], undefined);
});
test('contagem regressiva usa dias de calendário no Brasil, sem arredondar horas', () => {
  const beforeMidnight = new Date('2026-10-21T02:59:00Z');
  assert.equal(brazilDay(beforeMidnight), '2026-10-20');
  assert.equal(daysUntilRelease('2026-10-21', beforeMidnight), 1);
  assert.equal(daysUntilRelease('2026-10-21', new Date('2026-10-21T03:01:00Z')), 0);
  assert.equal(daysUntilRelease('2026-10-19', beforeMidnight), -1);
  assert.equal(daysUntilRelease(null), null);
});
test('quero ver e ver depois compartilham a mesma lista sem tocar avaliações', () => {
  const data = new Map([['void:reviews:v1', 'preservado']]);
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const movie = { id: 42, categoria: 'filmes', titulo: 'Filme' };
  assert.equal(toggleMovie(storage, movie)['42'].titulo, 'Filme');
  assert.equal(toggleMovie(storage, movie)['42'], undefined);
  assert.deepEqual(readMovieList(storage), {});
  assert.equal(data.get('void:reviews:v1'), 'preservado');
});
