// Explicitly exercise the retained RAWG adapter; IGDB has its own fixtures.
process.env.GAME_CATALOG_PROVIDER = 'rawg';
import { test, beforeEach } from 'node:test';
import { clearDetailCache } from '../lib/movie-detail.js';
import {clearSeriesCache} from '../lib/series-catalog.js';
beforeEach(()=>{clearDetailCache();clearSeriesCache();});
import assert from 'node:assert/strict';
import { getWork, validateWork } from '../lib/details.js';
import { workHref } from '../lib/work-client.js';
import handler from '../pages/api/obra.js';

function provider(t, data) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    calls.push(new URL(url));
    return { ok: true, json: async () => data };
  });
  return calls;
}
function configure(t, name) {
  const previous = process.env[name];
  process.env[name] = 'test-key';
  t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
}
function response() {
  return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}
test('identificadores rejeitam URLs arbitrárias, travessia e parâmetros repetidos', () => {
  assert.equal(validateWork('livros', '/works/OL123W'), false);
  assert.ok(validateWork('filmes', '438'));
  for (const [category, id] of [['livros', '/works/../authors/OL1A'], ['filmes', 'https://example.com'], ['filmes', ['1', '2']], ['filmes', '0'], ['unknown', '12']]) {
    assert.equal(validateWork(category, id), false);
  }
  assert.equal(workHref({ categoria: 'filmes', id: 42 }), '/filme/42');
});
test('filme consulta ID e créditos sem depender de uma lista de destaques', async t => {
  configure(t, 'TMDB_API_KEY');
  const calls = provider(t, { id: 42, title: 'Filme', vote_average: 9, vote_count: 8,
    runtime: 150, credits: { cast: [{ name: 'Pessoa', character: 'Personagem' }], crew: [{ name: 'Diretora', job: 'Director' }] } });
  const work = await getWork('filmes', '42');
  assert.equal(calls[0].pathname, '/3/movie/42');
  assert.equal(calls[0].searchParams.get('append_to_response'), 'credits,videos,images,release_dates');
  assert.equal(work.nota, 4.5);
  assert.equal(work.creditos[0].nome, 'Pessoa');
  assert.ok(work.informacoes.some(info => info.valor === '150 min'));
  assert.equal(work.poster, null);
});
test('séries e animes usam detalhes de TV e preservam temporadas', async t => {
  configure(t, 'TMDB_API_KEY');
  const calls = provider(t, { id: 7, name: 'Série', genres:[{id:16}],origin_country:['JP'],number_of_seasons: 3, number_of_episodes: 24 });
  for (const category of ['series', 'animes']) {
    const work = await getWork(category, '7');
    assert.equal(work.categoria, category);
    assert.ok(work.informacoes.some(info => info.label === 'Temporadas' && info.valor === '3'));
    assert.equal(work.nota, null);
  }
  assert.ok(calls.some(url=>url.pathname==='/3/tv/7'&&url.searchParams.get('append_to_response')==='credits,videos,images,content_ratings,keywords'));
  assert.ok(calls.every(url => ['/3/tv/7','/3/tv/7/videos'].includes(url.pathname)));
});
test('jogos usam descrição em texto, plataformas e estúdio', async t => {
  configure(t, 'RAWG_API_KEY');
  const calls = provider(t, { id: 9, name: 'Jogo', description: '<b>HTML</b>', description_raw: 'Texto seguro',
    rating: 4, ratings_count: 100, platforms: [{ platform: { name: 'PC' } }], developers: [{ name: 'Estúdio' }] });
  const work = await getWork('jogos', '9');
  assert.equal(calls[0].pathname, '/api/games/9');
  assert.equal(work.sinopse, 'Texto seguro');
  assert.equal(work.nota, 4);
  assert.equal(work.informacoes[0].valor, 'PC');
});

test('game facts expose only supplied classification, recognized modes and playtime without treating it as completion time', async t => {
  configure(t, 'RAWG_API_KEY');
  provider(t, { id: 9, name: 'Jogo', esrb_rating: { name: 'Teen' }, playtime: 12,
    tags: [{ slug: 'singleplayer' }, { slug: 'online-co-op' }, { slug: 'unrelated-tag' }] });
  const work = await getWork('jogos', '9');
  assert.equal(work.informacoes.find(info => info.label === 'Classificação indicativa').valor, 'Teen');
  assert.equal(work.informacoes.find(info => info.label === 'Modos de jogo').valor, 'Um jogador, Cooperativo online');
  assert.match(work.informacoes.find(info => info.label.includes('Tempo médio jogado')).valor, /12 h \(não é o tempo para zerar\)/);
});
test('endpoint de detalhes distingue método, entrada inválida e obra inexistente', async t => {
  let res = response();
  await handler({ method: 'POST', query: {} }, res);
  assert.equal(res.code, 405);
  assert.equal(res.headers.Allow, 'GET');
  res = response();
  await handler({ method: 'GET', query: { categoria: 'livros', id: '/etc/passwd' } }, res);
  assert.equal(res.code, 400);
  configure(t, 'TMDB_API_KEY');
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 404 }));
  res = response();
  await handler({ method: 'GET', query: { categoria: 'filmes', id: '42' } }, res);
  assert.equal(res.code, 404);
  assert.equal(res.headers['Cache-Control'], undefined);
});
test('endpoint retorna obra e cache para uma consulta válida', async t => {
  configure(t, 'TMDB_API_KEY');
  provider(t, { id: 42, title: 'Filme' });
  const res = response();
  await handler({ method: 'GET', query: { categoria: 'filmes', id: '42' } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.obra.titulo, 'Filme');
  assert.match(res.headers['Cache-Control'], /s-maxage/);
});
