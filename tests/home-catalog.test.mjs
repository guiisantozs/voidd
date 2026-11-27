import test from 'node:test';
import assert from 'node:assert/strict';
import { homeContinue, homeGenres, homeMatches, homeWeeklyReviews } from '../lib/home-catalog.js';

test('home search ignores accents, respects selected category and keeps unfinished categories unavailable', () => {
  const movie = { id: 1, categoria: 'filmes', titulo: 'Ação e coração' };
  assert.equal(homeMatches(movie, ' CORACAO '), true);
  assert.equal(homeMatches(movie, '', 'jogos'), false);
  assert.equal(homeMatches({ ...movie, categoria: 'series' }), false);
  assert.equal(homeMatches({ ...movie, categoria: 'animes' }), false);
  assert.equal(homeMatches(null), false);
  assert.deepEqual(homeGenres({ ...movie, genreIds: [28, 18, 999] }), ['Ação', 'Drama']);
  assert.deepEqual(homeGenres({ categoria: 'jogos', generos: ['Action', 'Adventure'] }), ['Ação', 'Aventura']);
});
test('continue uses real statuses, prioritizes playing games, excludes finished games and preserves film IDs', () => {
  const game = (id, status) => ({ item: { id, categoria: 'jogos', titulo: `Jogo ${id}` }, status });
  const input = { 1: game(1, 'want'), 2: game(2, 'finished'), 3: game(3, 'playing'), 4: game(4, 'paused'), 5: game(5, 'unknown') };
  const list = { 1: { id: 1, categoria: 'filmes', titulo: 'Filme 1' }, 9: { id: 9, categoria: 'animes', titulo: 'Indisponível' } };
  const before = JSON.stringify({ input, list }), result = homeContinue(input, list);
  assert.deepEqual(result.map(({ item, label }) => [item.categoria, item.id, label]), [['jogos', 3, 'Jogando'], ['jogos', 4, 'Pausado'], ['jogos', 1, 'Quero jogar'], ['filmes', 1, 'Ver depois']]);
  assert.equal(JSON.stringify({ input, list }), before);
  assert.deepEqual(homeContinue(), []);
});
test('weekly community has real dates and /5 ratings including zero; no null score becomes zero', () => {
  const now = Date.parse('2026-10-23T18:00:00Z');
  const row = (rating, days = 0) => ({ rating, movie: { titulo: 'Filme' }, updated_at: new Date(now - days * 86400000).toISOString() });
  const rows = [row(0), row('4.7'), row(null), row(''), row(7), row(4, 8), row(4, -1), { ...row(3), updated_at: 'invalid' }];
  assert.deepEqual(homeWeeklyReviews(rows, now).map(row => row.rating), [0, '4.7']);
  assert.equal(homeWeeklyReviews(Array.from({ length: 5 }, () => row(4)), now).length, 3);
});
