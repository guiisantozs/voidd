import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLibraryQuery, libraryQueryUpdate, libraryFilterChips } from '../lib/game-library-filters.js';
import { gameLibraryView } from '../lib/game-library-view.js';

const game = (id, titulo, ano, plataformas, generos, nota) => ({ id, titulo, ano, plataformas, generos, nota, categoria: 'jogos' });
const a = game(1, 'Zelda', 2023, ['Nintendo Switch'], ['Adventure', 'Action'], 4);
const b = game(2, 'Água', 2020, ['PlayStation 5', 'PC'], ['Ação', 'RPG'], 5);
const c = game(3, 'Beta', 2019, ['Xbox One', 'Windows'], ['Action', 'Metroidvania'], 3);
const d = game(4, 'Delta', '', ['PlayStation 4'], ['Puzzle'], 4.5);
const entries = { 1: { item: a, status: 'finished' }, 2: { item: b, status: 'finished' }, 3: { item: c, status: 'playing' }, 4: { item: d, status: 'want' } };
const reviews = { 'jogos:1': { item: a, nota: 5 }, 'jogos:2': { item: b, nota: 0 }, 'jogos:3': { item: c, nota: 4 } };

test('URL filters parse zero ratings, reject repeated/invalid parameters and round-trip through query strings', () => {
  const query = { status: 'finished', platform: 'playstation', genre: 'action', yearFrom: '2019', yearTo: '2023', minRating: '0', order: 'userRating' };
  const normalized = parseLibraryQuery(query);
  assert.equal(normalized.minRating, '0');
  assert.deepEqual(parseLibraryQuery(Object.fromEntries(new URLSearchParams(libraryQueryUpdate(query, {})))), normalized);
  const invalid = parseLibraryQuery({ status: ['playing', 'finished'], platform: 'bad', genre: '<script>', yearFrom: 'NaN', yearTo: '2020.5', minRating: '5.1', order: ['title'] });
  assert.equal(invalid.status, 'all'); assert.equal(invalid.platform, ''); assert.equal(invalid.genre, '');
  assert.equal(invalid.minRating, ''); assert.equal(invalid.yearFrom, ''); assert.equal(invalid.yearTo, ''); assert.equal(invalid.order, 'popular');
  for (const value of ['-1', '5.1', '1.22', '', ['4']]) assert.equal(parseLibraryQuery({ minRating: value }).minRating, '');
});

test('URL updates preserve combinations, remove single chips and allow full reset without stale parameters', () => {
  const query = { status: 'finished', platform: 'playstation', genre: 'action', minRating: '4', order: 'title' };
  assert.deepEqual(libraryQueryUpdate(query, { status: 'want' }), { ...query, status: 'want' });
  assert.deepEqual(libraryQueryUpdate(query, { platform: '' }), { status: 'finished', genre: 'action', minRating: '4', order: 'title' });
  assert.deepEqual(libraryQueryUpdate(query, { status: 'all', platform: '', genre: '', minRating: '', order: 'popular' }), {});
  const chips = libraryFilterChips(parseLibraryQuery({ ...query, minRating: '0' }), [{ key: 'action', label: 'Ação' }]);
  assert.equal(chips.length, 4); assert.ok(chips.some(chip => chip.key === 'minRating' && chip.label.includes('0')));
});

test('combined filters intersect and tab counts reflect all filters except the selected status', () => {
  const filtered = gameLibraryView(entries, reviews, parseLibraryQuery({ status: 'finished', platform: 'pc', genre: 'action', yearFrom: '2019', yearTo: '2020', minRating: '0' }));
  assert.deepEqual(filtered.items.map(item => item.id), [2]);
  assert.equal(filtered.counts.all, 2); assert.equal(filtered.counts.finished, 1); assert.equal(filtered.counts.playing, 1); assert.equal(filtered.counts.want, 0);
  assert.equal(filtered.totalCounts.all, 4); assert.equal(filtered.summary.average, 3);
  const withRating = gameLibraryView(entries, reviews, { minRating: '4', platform: 'pc' });
  assert.deepEqual(withRating.items.map(item => item.id), [3]);
  assert.equal(gameLibraryView(entries, reviews, { minRating: '0' }).items.length, 3);
  assert.equal(gameLibraryView(entries, reviews, { yearFrom: '2024', yearTo: '2020' }).items.length, 0);
  assert.equal(gameLibraryView(entries, reviews, { yearTo: '2024' }).items.length, 3);
});

test('genres are drawn from the whole library, merge known translations and survive narrowing to no matches', () => {
  const view = gameLibraryView(entries, reviews, { platform: 'nintendo', minRating: '5', genre: 'action' });
  assert.deepEqual(view.items.map(item => item.id), [1]);
  assert.equal(view.genres.filter(genre => genre.key === 'action').length, 1);
  assert.ok(view.genres.some(genre => genre.key === 'metroidvania'));
  assert.ok(!view.genres.some(genre => genre.key === 'sports'));
  assert.deepEqual(gameLibraryView(entries, reviews, { genre: 'missing' }).genres, view.genres);
  assert.equal(gameLibraryView(entries, reviews, { genre: 'role-playing-games-rpg' }).items[0].id, 2);
});

test('catalogue, personal rating, release and title orders are distinct and do not mutate stored records', () => {
  const snapshot = JSON.stringify({ entries, reviews });
  const ids = order => gameLibraryView(entries, reviews, { order }).items.map(item => item.id);
  assert.deepEqual(ids('popular'), [1, 2, 3, 4]);
  assert.deepEqual(ids('rating'), [2, 4, 1, 3]);
  assert.deepEqual(ids('userRating'), [1, 3, 2, 4]);
  assert.deepEqual(ids('year'), [1, 2, 3, 4]);
  assert.deepEqual(ids('title'), [2, 3, 4, 1]);
  assert.equal(JSON.stringify({ entries, reviews }), snapshot);
});
