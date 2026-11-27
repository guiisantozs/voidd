import test from 'node:test';
import assert from 'node:assert/strict';
import { addRecentPerson, readRecentPeople, recentPeopleKey } from '../lib/people-search.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
const person = n => ({ user_id: `person-${n}`, username: `pessoa${n}`, display_name: `Pessoa ${n}`, avatar_url: '', following: true, bio: 'Não guardar', email: 'Não guardar' });

test('recent people retain only five public identities and move a reopened profile to the front', () => {
  const storage = memoryStorage(), key = recentPeopleKey('owner');
  for (let n = 1; n <= 7; n++) addRecentPerson(storage, key, person(n));
  assert.deepEqual(readRecentPeople(storage, key).map(row => row.user_id), ['person-7', 'person-6', 'person-5', 'person-4', 'person-3']);
  addRecentPerson(storage, key, { ...person(5), username: 'novo.nome' });
  const rows = readRecentPeople(storage, key);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].username, 'novo.nome');
  assert.deepEqual(Object.keys(rows[0]).sort(), ['avatar_url', 'display_name', 'user_id', 'username']);
});

test('recent people are isolated between visitor and accounts and can be cleared locally', () => {
  const storage = memoryStorage();
  addRecentPerson(storage, recentPeopleKey('a'), person(1));
  addRecentPerson(storage, recentPeopleKey(), person(2));
  assert.deepEqual(readRecentPeople(storage, recentPeopleKey('b')), []);
  storage.removeItem(recentPeopleKey('a'));
  assert.deepEqual(readRecentPeople(storage, recentPeopleKey('a')), []);
  assert.equal(readRecentPeople(storage, recentPeopleKey())[0].user_id, 'person-2');
});

test('unavailable or malformed browser history does not prevent searching', () => {
  const storage = memoryStorage(), key = recentPeopleKey();
  for (const value of ['{', '{}', 'null', '[null,{},42]']) {
    storage.setItem(key, value);
    assert.deepEqual(readRecentPeople(storage, key), []);
  }
  assert.deepEqual(readRecentPeople({ getItem() { throw Error('Storage blocked'); } }, key), []);
});
