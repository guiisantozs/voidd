import test from 'node:test';
import assert from 'node:assert/strict';
import { gameLibraryView, libraryFilter, libraryStatus } from '../lib/game-library-view.js';
import { setGameStatus } from '../lib/library.js';

const game = (id, titulo, ano = 2020) => ({ id, titulo, ano, categoria: 'jogos' });
test('library merges reviewed games, counts detailed statuses and filters without mutating records', () => {
  const a = game(1, 'Água'), b = game(2, 'Beta', 2025), c = game(3, 'Céu');
  const entries = { 1: { item: a, status: 'finished', statusDetail: 'platinum' }, 2: { item: b, status: 'paused', statusDetail: 'abandoned' } };
  const reviews = { 'jogos:1': { item: a, nota: 0 }, 'jogos:3': { item: c, nota: 4.5 } };
  const snapshot = JSON.stringify({ entries, reviews });
  const view = gameLibraryView(entries, reviews);
  assert.equal(view.counts.all, 3); assert.equal(view.counts.platinum, 1); assert.equal(view.counts.finished, 0);
  assert.equal(view.counts.abandoned, 1); assert.equal(view.counts.none, 1);
  assert.deepEqual(gameLibraryView(entries, reviews, { status: 'none' }).items, [c]);
  assert.deepEqual(gameLibraryView(entries, reviews, { query: 'agua' }).items, [a]);
  assert.equal(gameLibraryView(entries, reviews, { order: 'year' }).items[0].id, 2);
  assert.equal(gameLibraryView(entries, reviews, { order: 'userRating' }).items[0].id, 3);
  assert.equal(JSON.stringify({ entries, reviews }), snapshot);
  assert.equal(libraryFilter('finished'), 'finished'); assert.equal(libraryFilter(['finished']), 'all'); assert.equal(libraryFilter('invalid'), 'all');
});

test('status changes immediately move counts and preserve reviewed games when clearing status', () => {
  const values = new Map(); const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const item = game(4, 'Journey'); const reviews = { 'jogos:4': { item, nota: 0 } };
  let entries = setGameStatus(storage, item, 'want');
  assert.equal(gameLibraryView(entries, reviews).counts.want, 1);
  entries = setGameStatus(storage, item, 'playing');
  assert.equal(gameLibraryView(entries, reviews).counts.want, 0);
  assert.equal(gameLibraryView(entries, reviews).counts.playing, 1);
  entries = setGameStatus(storage, item, 'platinum'); assert.equal(libraryStatus(item, entries), 'platinum');
  entries = setGameStatus(storage, item, '');
  assert.equal(gameLibraryView(entries, reviews).counts.none, 1);
  assert.equal(gameLibraryView(entries, {}).counts.all, 0);
});

test('library overview uses all games and valid personal ratings including zero regardless of filters', () => {
  const entries = Object.fromEntries(['playing', 'want', 'paused', 'finished', 'platinum', 'abandoned'].map((status, index) => [index + 1, { item: game(index + 1, `Game ${index + 1}`), status: status === 'platinum' ? 'finished' : status === 'abandoned' ? 'paused' : status, ...(['platinum', 'abandoned'].includes(status) ? { statusDetail: status } : {}) }]));
  const reviews = { 'jogos:1': { item: game(1, 'Game 1'), nota: 0 }, 'jogos:4': { item: game(4, 'Game 4'), nota: 5 }, 'jogos:7': { item: game(7, 'Game 7'), nota: 4 }, 'jogos:6': { item: game(6, 'Game 6'), nota: 9 } };
  const view = gameLibraryView(entries, reviews);
  assert.equal(view.counts.all, 7); assert.equal(view.summary.completed, 2);
  assert.equal(view.summary.percent, 29); assert.equal(view.summary.average, 3); assert.equal(view.summary.rated, 3);
  assert.deepEqual(view.shelves.map(shelf => shelf.key), ['playing', 'want', 'paused', 'finished', 'platinum', 'abandoned', 'none']);
  assert.deepEqual(view.playing, []); // Legacy playing means Em andamento, never an active presence.
  const filtered = gameLibraryView(entries, reviews, { status: 'want', query: 'missing' });
  assert.equal(filtered.items.length, 0); assert.deepEqual(filtered.shelves, []);
  assert.deepEqual(filtered.summary, view.summary); assert.deepEqual(filtered.playing, view.playing);
  assert.equal(filtered.counts.all, 0); assert.deepEqual(filtered.totalCounts, view.totalCounts);
});

test('empty and unreviewed libraries have no invented average or completion and hide empty shelves', () => {
  const empty = gameLibraryView({}, {});
  assert.deepEqual(empty.summary, { average: null, rated: 0, completed: 0, percent: 0 });
  assert.deepEqual(empty.shelves, []); assert.deepEqual(empty.playing, []);
  const item = game(1, 'One');
  const view = gameLibraryView({ 1: { item, status: 'finished' } }, {});
  assert.equal(view.summary.average, null); assert.equal(view.summary.percent, 100);
  assert.deepEqual(view.shelves.map(shelf => shelf.key), ['finished']);
});
