import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogHandler, fetchJson, tmdb } from '../lib/api.js';

function response() {
  return { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}
test('API aceita somente GET e não consulta o provedor em POST', async () => {
  const res = response();
  await catalogHandler('filmes', () => { throw new Error('Não deveria executar'); })({ method: 'POST' }, res);
  assert.equal(res.code, 405);
  assert.equal(res.headers.Allow, 'GET');
});
test('API responde com catálogo e cache no sucesso', async () => {
  const res = response();
  await catalogHandler('jogos', async () => [{ id: 1 }])({ method: 'GET' }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { jogos: [{ id: 1 }] });
  assert.match(res.headers['Cache-Control'], /s-maxage=300/);
});
test('falhas de configuração e provedor não expõem detalhes internos', async () => {
  for (const [message, expected] of [['CONFIG', 503], ['secret-provider-token', 502]]) {
    const res = response();
    await catalogHandler('filmes', async () => { throw new Error(message); })({ method: 'GET' }, res);
    assert.equal(res.code, expected);
    assert.ok(!JSON.stringify(res.body).includes(message));
    assert.equal(res.headers['Cache-Control'], undefined);
  }
});
test('fetchJson rejeita respostas HTTP inválidas', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, json() { throw new Error('Não ler corpo'); } }));
  await assert.rejects(fetchJson('https://example.com'), /Serviço indisponível/);
});
test('TMDB normaliza notas, mantém ausência de nota e filtra conteúdo adulto', async t => {
  const previous = process.env.TMDB_API_KEY;
  process.env.TMDB_API_KEY = 'test-key';
  t.after(() => { if (previous === undefined) delete process.env.TMDB_API_KEY; else process.env.TMDB_API_KEY = previous; });
  let requested;
  t.mock.method(globalThis, 'fetch', async url => {
    requested = new URL(url);
    return { ok: true, json: async () => ({ results: [
      { id: 1, name: 'Anime', vote_average: 8, vote_count: 20, first_air_date: '2020-01-01', backdrop_path: '/scene.jpg' },
      { id: 2, name: 'Sem votos', vote_average: 0, vote_count: 0 },
      { id: 3, name: 'Adulto', adult: true },
    ] }) };
  });
  const items = await tmdb('discover/tv', 'anime');
  assert.equal(items.length, 2);
  assert.equal(items[0].nota, 4);
  assert.equal(items[0].ano, '2020');
  assert.equal(items[0].poster, null);
  assert.equal(items[0].backdrop, 'https://image.tmdb.org/t/p/w1280/scene.jpg');
  assert.equal(items[1].backdrop, null);
  assert.equal(items[1].nota, null);
  assert.equal(requested.searchParams.get('with_origin_country'), 'JP');
  assert.equal(requested.searchParams.get('language'), 'pt-BR');
});
