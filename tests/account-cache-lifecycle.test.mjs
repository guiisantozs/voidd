import test from 'node:test';
import assert from 'node:assert/strict';
import { accountGenerationStorage, currentAccountStorage, pruneAccountCache } from '../lib/account-cache-lifecycle.js';
const storage = () => { const m = new Map(); return { getItem:k => m.get(k) ?? null, setItem:(k,v) => m.set(k,v), removeItem:k => m.delete(k) }; };

test('logout removes synchronized private cache without touching guest or other accounts', () => {
  const s = storage();
  s.setItem('void:account:a:v1', JSON.stringify({ data: { 'void:reviews:v1': '{"private":"synced"}' }, pending: {} }));
  s.setItem('void:account:b:v1', 'other'); s.setItem('void:reviews:v1', 'guest');
  s.setItem('void:people-recent:a:v1', 'private history');
  assert.deepEqual(pruneAccountCache(s, 'a'), { pending: 0, drafts: 0 });
  assert.equal(s.getItem('void:account:a:v1'), null);
  assert.equal(s.getItem('void:people-recent:a:v1'), null);
  assert.equal(s.getItem('void:account:b:v1'), 'other'); assert.equal(s.getItem('void:reviews:v1'), 'guest');
});
test('logout retains only pending payloads/tombstones and drafts, never synced history', () => {
  const s = storage(), pending = { 'review:filmes:1': {kind:'review',item_key:'filmes:1',payload:{texto:'offline'}}, 'review:filmes:2': {kind:'review',item_key:'filmes:2',payload:null} };
  s.setItem('void:account:a:v1', JSON.stringify({ data: { 'void:reviews:v1': '{"synced":"private"}', 'void:draft:filmes:3': 'draft' }, pending }));
  assert.deepEqual(pruneAccountCache(s, 'a'), { pending: 2, drafts: 1 });
  const state = JSON.parse(s.getItem('void:account:a:v1'));
  assert.deepEqual(state.pending, pending);
  assert.deepEqual(JSON.parse(state.data['void:reviews:v1']), { 'filmes:1': {texto:'offline'} });
  assert.equal(state.data['void:draft:filmes:3'], 'draft');
});
test('late synchronization cannot read or write through a revoked account scope', () => {
  const s = storage(); let active = true;
  const scoped = currentAccountStorage(s, () => active);
  scoped.setItem('private', 'before'); active = false;
  assert.throws(() => scoped.setItem('private', 'late'), /ACCOUNT_CHANGED/);
  assert.throws(() => scoped.getItem('private'), /ACCOUNT_CHANGED/);
  assert.equal(s.getItem('private'), 'before');
});

test('logout invalidates every old account storage generation while a fresh login can write', () => {
  const s = storage(), old = accountGenerationStorage(s, 'generation-test');
  pruneAccountCache(s, 'generation-test');
  assert.throws(() => old.setItem('late', 'private'), /ACCOUNT_CHANGED/);
  const fresh = accountGenerationStorage(s, 'generation-test');
  fresh.setItem('fresh', 'allowed');
  assert.equal(s.getItem('late'), null);
  assert.equal(s.getItem('fresh'), 'allowed');
});
