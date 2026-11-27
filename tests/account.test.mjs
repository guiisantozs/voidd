import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountKey, importGuest, LIST_KEY, mergeCloud, readAccount, REVIEWS_KEY, scopedStorage, syncAccount } from '../lib/account-storage.js';

function store() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
const item = { id: 42, categoria: 'jogos', titulo: 'Jogo' };
const record = { item, nota: 4, texto: 'Gostei', spoiler: false };
test('visitante e contas diferentes usam caches isolados sem alterar o legado', () => {
  const storage = store();
  storage.setItem(REVIEWS_KEY, JSON.stringify({ 'jogos:42': record }));
  const first = scopedStorage(storage, 'first');
  const second = scopedStorage(storage, 'second');
  assert.equal(first.getItem(REVIEWS_KEY), null);
  first.setItem(REVIEWS_KEY, JSON.stringify({ 'jogos:42': record }));
  assert.equal(second.getItem(REVIEWS_KEY), null);
  assert.ok(storage.getItem(REVIEWS_KEY).includes('Gostei'));
  assert.equal(readAccount(storage, 'first').pending['review:jogos:42'].payload.nota, 4);
});
test('remoção gera marcador persistente e rascunhos não entram na fila', () => {
  const storage = store();
  const scoped = scopedStorage(storage, 'u');
  scoped.setItem(LIST_KEY, JSON.stringify({ 42: { item, status: 'want' } }));
  scoped.setItem(LIST_KEY, '{}');
  scoped.setItem('void:draft:jogos:42', JSON.stringify(record));
  const pending = readAccount(storage, 'u').pending;
  assert.equal(pending['library:42'].payload, null);
  assert.equal(Object.keys(pending).length, 1);
});
test('download preserva pendências locais e ignora linhas de outra conta', () => {
  const storage = store();
  scopedStorage(storage, 'u').setItem(REVIEWS_KEY, JSON.stringify({ 'jogos:42': record }));
  mergeCloud(storage, 'u', [
    { user_id: 'u', kind: 'review', item_key: 'jogos:42', payload: { ...record, nota: 1 } },
    { user_id: 'other', kind: 'review', item_key: 'jogos:99', payload: record },
  ]);
  const reviews = JSON.parse(scopedStorage(storage, 'u').getItem(REVIEWS_KEY));
  assert.equal(reviews['jogos:42'].nota, 4);
  assert.equal(reviews['jogos:99'], undefined);
});
test('importação preserva visitante e versão já existente na conta; ignora livros', () => {
  const storage = store();
  storage.setItem(REVIEWS_KEY, JSON.stringify({ 'jogos:42': record, 'jogos:43': { ...record, item: { ...item, id: 43 } }, 'livros:1': { ...record, item: { ...item, categoria: 'livros' } } }));
  const scoped = scopedStorage(storage, 'u');
  scoped.setItem(REVIEWS_KEY, JSON.stringify({ 'jogos:42': { ...record, nota: 5 } }));
  assert.equal(importGuest(storage, 'u'), 1);
  assert.equal(JSON.parse(scoped.getItem(REVIEWS_KEY))['jogos:42'].nota, 5);
  assert.ok(storage.getItem(REVIEWS_KEY).includes('livros:1'));
});
test('cache corrompido não é substituído em uma tentativa de salvamento', () => {
  const storage = store();
  storage.setItem(accountKey('u'), '{');
  assert.throws(() => scopedStorage(storage, 'u').setItem(REVIEWS_KEY, '{}'));
  assert.equal(storage.getItem(accountKey('u')), '{');
});
test('erro no banco conserva fila e não indica sincronização concluída', async () => {
  const storage = store();
  scopedStorage(storage, 'u').setItem(REVIEWS_KEY, JSON.stringify({ 'jogos:42': record }));
  const client = { from: () => ({ upsert: async () => ({ error: new Error('offline') }) }) };
  await assert.rejects(syncAccount(client, storage, 'u'), /offline/);
  assert.equal(Object.keys(readAccount(storage, 'u').pending).length, 1);
});
test('confirmação de envio não apaga mudança realizada durante a requisição', async () => {
  const storage = store();
  const scoped = scopedStorage(storage, 'u');
  scoped.setItem(REVIEWS_KEY, JSON.stringify({ 'jogos:42': record }));
  const client = { from: () => ({ upsert: async rows => {
    assert.equal(rows[0].user_id, 'u');
    scoped.setItem(REVIEWS_KEY, JSON.stringify({ 'jogos:42': { ...record, nota: 5 } }));
    return { error: null };
  } }) };
  assert.equal(await syncAccount(client, storage, 'u'), 1);
  assert.equal(readAccount(storage, 'u').pending['review:jogos:42'].payload.nota, 5);
});
test('download paginado aplica remoções e não ressuscita status', async () => {
  const storage = store();
  const pages = [Array.from({ length: 500 }, (_, i) => ({ user_id: 'u', kind: 'library', item_key: String(i + 1), payload: { item: { ...item, id: i + 1 }, status: 'want' } })), [{ user_id: 'u', kind: 'library', item_key: '42', payload: null }]];
  const client = { from: () => ({ select() { return this; }, eq() { return this; }, order() { return this; }, range: async (start) => ({ data: pages[start / 500], error: null }) }) };
  await syncAccount(client, storage, 'u', true);
  const library = JSON.parse(scopedStorage(storage, 'u').getItem(LIST_KEY));
  assert.equal(Object.keys(library).length, 499);
  assert.equal(library['42'], undefined);
});
