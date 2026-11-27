import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY_KEY, libraryGames, readLibrary, setGameStatus } from '../lib/library.js';

function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
const game = { id: 42, titulo: 'Jogo', categoria: 'jogos' };
test('status persiste e muda sem apagar outros jogos ou avaliações', () => {
  const store = storage({ 'void:reviews:v1': '{"preservado":true}' });
  setGameStatus(store, game, 'want');
  setGameStatus(store, { ...game, id: 43 }, 'playing');
  setGameStatus(store, game, 'finished');
  assert.equal(readLibrary(store)['42'].status, 'finished');
  assert.equal(readLibrary(store)['43'].status, 'playing');
  setGameStatus(store, game, '');
  assert.equal(readLibrary(store)['42'], undefined);
  assert.equal(readLibrary(store)['43'].status, 'playing');
  assert.equal(store.getItem('void:reviews:v1'), '{"preservado":true}');
});
test('biblioteca une jogos listados e avaliados sem duplicar IDs numéricos ou string', () => {
  const library = { 42: { item: game, status: 'want' } };
  const reviews = { a: { item: { ...game, id: '42' } }, b: { item: { ...game, id: 43 } }, c: { item: { ...game, categoria: 'filmes' } } };
  assert.deepEqual(libraryGames(library, reviews).map(item => String(item.id)), ['42', '43']);
});
test('dados corrompidos e status inválidos não sobrescrevem registros', () => {
  for (const value of ['{', '[]', '{"42":{"status":"invalid"}}']) {
    const store = storage({ [LIBRARY_KEY]: value });
    assert.throws(() => setGameStatus(store, game, 'want'));
    assert.equal(store.getItem(LIBRARY_KEY), value);
  }
  assert.throws(() => setGameStatus(storage(), game, 'invalid'));
  assert.throws(() => setGameStatus(storage(), { ...game, categoria: 'filmes' }, 'want'));
});
test('falha do navegador é propagada sem simular um salvamento', () => {
  const store = storage();
  store.setItem = () => { throw new Error('Quota excedida'); };
  assert.throws(() => setGameStatus(store, game, 'paused'), /Quota/);
  assert.deepEqual(readLibrary(store), {});
});
