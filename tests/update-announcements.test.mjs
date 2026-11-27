import test from 'node:test';
import assert from 'node:assert/strict';
import { currentUpdate } from '../updates.config.js';
import { markUpdateSeen, shouldShowUpdate, updateSeenKey } from '../lib/update-announcements.js';

function memory() { const data = new Map(); return { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) }; }
test('Update is shown only to a signed-in account and is scoped to both account and version', () => {
 const storage = memory(), update = { ...currentUpdate, id: 'scope_test' };
 assert.equal(shouldShowUpdate(storage, update, null), false);
 assert.equal(shouldShowUpdate(storage, update, 'account-a'), true);
 assert.equal(updateSeenKey(currentUpdate, 'account-a'), 'void_update_gamer_v1:account-a');
 assert.equal(markUpdateSeen(storage, update, 'account-a'), true);
 assert.equal(shouldShowUpdate(storage, update, 'account-a'), false);
 assert.equal(shouldShowUpdate(storage, update, 'account-b'), true);
 assert.equal(shouldShowUpdate(storage, { ...update, version: 'v2' }, 'account-a'), true);
});
test('Seen state survives a fresh reader and storage failure falls back to memory without blocking login', () => {
 const storage = memory(), update = { ...currentUpdate, id: 'persistent_test' };
 storage.setItem(updateSeenKey(update, 'account-a'), 'seen');
 assert.equal(shouldShowUpdate(storage, update, 'account-a'), false);
 const broken = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
 const fallback = { ...update, id: 'fallback_test' };
 assert.equal(shouldShowUpdate(broken, fallback, 'account-a'), true);
 assert.equal(markUpdateSeen(broken, fallback, 'account-a'), false);
 assert.equal(shouldShowUpdate(broken, fallback, 'account-a'), false);
 assert.equal(shouldShowUpdate(broken, fallback, 'account-b'), true);
});
test('Invalid/disabled configuration does not create global seen keys or announce to visitors', () => {
 const storage = memory();
 assert.equal(shouldShowUpdate(storage, { ...currentUpdate, enabled: false }, 'account-a'), false);
 assert.equal(shouldShowUpdate(storage, { ...currentUpdate, id: '' }, 'account-a'), false);
 assert.equal(markUpdateSeen(storage, currentUpdate, null), false);
 assert.equal(updateSeenKey({ id: '../invalid', version: 'v1' }, 'account-a'), null);
});
