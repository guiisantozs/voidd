import test from 'node:test';
import assert from 'node:assert/strict';
import { gameReviewHref, legacyGameReviewRedirect } from '../lib/game-review-navigation.js';
import { gameStatuses, gameStatusKey, readLibrary, setGameStatus } from '../lib/library.js';
import { shouldOfferFinishReview } from '../lib/game-journey.js';

function storage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
const game = { id: 91234, titulo: 'Jogo', categoria: 'jogos' };

test('game review links converge on the full editor without changing other media', () => {
  assert.equal(gameReviewHref(42), '/obra/jogos/42#sua-jornada');
  assert.equal(legacyGameReviewRedirect({ categoria: 'jogos', id: '42', editar: '1' }), '/obra/jogos/42?editar=1#sua-jornada');
  for (const id of ['', '0', '-1', 'abc', ['42'], null]) assert.equal(gameReviewHref(id), null);
  assert.equal(legacyGameReviewRedirect({ categoria: 'filmes', id: '42' }), null);
  assert.equal(legacyGameReviewRedirect({ categoria: 'jogos', id: ['42'] }), null);
});

test('only terminal statuses offer an automatic review, while zero remains a saved review', () => {
  const session = storage();
  for (const status of gameStatuses) {
    assert.equal(shouldOfferFinishReview(session, 'navigation-test', game, status.key, '', {}), ['abandoned', 'finished', 'platinum'].includes(status.key), status.key);
    assert.equal(shouldOfferFinishReview(session, 'navigation-test', game, status.key, status.key, {}), false);
    assert.equal(shouldOfferFinishReview(session, 'navigation-test', game, status.key, '', { 'jogos:91234': { nota: 0 } }), false);
  }
});

test('manual playing presence survives reload and clears independently from progress', () => {
  const store = storage(), now = new Date('2026-10-26T15:00:00Z');
  setGameStatus(store, game, 'playing_now', now);
  const record = readLibrary(store)[game.id];
  assert.equal(record.status, 'playing');
  assert.equal(gameStatusKey(record), 'playing_now');
  assert.deepEqual(record.presence, { source: 'manual', marked_at: now.toISOString() });
  assert.equal(record.started_at, now.toISOString());
  setGameStatus(store, game, 'playing', now);
  assert.equal(gameStatusKey(readLibrary(store)[game.id]), 'playing');
  assert.equal(readLibrary(store)[game.id].presence, undefined);
  assert.equal(readLibrary(store)[game.id].statusDetail, undefined);
  for (const option of gameStatuses) {
    setGameStatus(store, game, option.key, now);
    assert.equal(gameStatusKey(readLibrary(store)[game.id]), option.key);
  }
});
