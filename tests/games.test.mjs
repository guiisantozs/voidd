// Explicitly exercise the retained RAWG adapter; IGDB has its own fixtures.
process.env.GAME_CATALOG_PROVIDER = 'rawg';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editorialGames, filterGames } from '../lib/games.js';
import { getWork } from '../lib/details.js';
import {createGameOverviewSource} from '../lib/game-overview-source.js';

test('filtros de jogos combinam título, plataforma e gênero', () => {
  const selected = filterGames(editorialGames, { query: 'witcher', platform: 'Nintendo', genre: 'RPG' });
  assert.equal(selected.length, 1);
  assert.equal(selected[0].id, 3328);
  assert.equal(filterGames(editorialGames, { query: 'portal', platform: 'Nintendo' }).length, 0);
  assert.equal(filterGames(editorialGames, { query: '  ELDEN ' })[0].id, 326243);
});
test('ordenação não modifica catálogo e mantém ausência de nota no fim', () => {
  const items = [{ titulo: 'A', nota: null, ano: '2024' }, { titulo: 'B', nota: 4.5, ano: '2020' }, { titulo: 'C', nota: 3, ano: '2022' }];
  assert.deepEqual(filterGames(items, { order: 'rating' }).map(item => item.titulo), ['B', 'C', 'A']);
  assert.deepEqual(filterGames(items, { order: 'year' }).map(item => item.titulo), ['A', 'C', 'B']);
  assert.equal(items[0].titulo, 'A');
  assert.ok(editorialGames.every(item => item.editorial && item.nota === null));
});
test('detalhes aparecem sem esperar a mídia; a galeria consulta cenas independentemente e expõe falhas reais', async t => {
  const previous = process.env.RAWG_API_KEY;
  process.env.RAWG_API_KEY = 'test-key';
  t.after(() => { if (previous === undefined) delete process.env.RAWG_API_KEY; else process.env.RAWG_API_KEY = previous; });
  let failScenes = false;
  t.mock.method(globalThis, 'fetch', async url => {
    if (new URL(url).pathname.endsWith('/screenshots')) {
      if (failScenes) return { ok: false, status: 503 };
      return { ok: true, json: async () => ({ results: [{ image: 'https://example.com/scene.jpg' }] }) };
    }
    return { ok: true, json: async () => ({ id: 42, name: 'Jogo', background_image: 'https://example.com/cover.jpg', parent_platforms: [{ platform: { name: 'PC' } }] }) };
  });
  const game = await getWork('jogos', '42');
  assert.equal(game.screenshots, undefined);
  assert.deepEqual(game.plataformas, ['PC']);
  const load=createGameOverviewSource({credentials:()=> 'test-key'});
  assert.deepEqual(await load('42','screenshots'), ['https://example.com/scene.jpg']);
  failScenes = true;
  const withoutScenes = await getWork('jogos', '42');
  assert.equal(withoutScenes.titulo, 'Jogo');
  assert.equal(withoutScenes.screenshots, undefined);
  await assert.rejects(load('43','screenshots'));
});
