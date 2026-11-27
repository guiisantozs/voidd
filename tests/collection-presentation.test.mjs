import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionBadges, collectionLevel, collectionPortraitSources, gameAchievementSummary } from '../lib/collection-presentation.js';

test('Collection XP is a visual calculation from recorded hours, unlocks and completed games', () => {
  const stats = Object.freeze({ minutes: 6000, unlocked: 10, completed: 1 });
  assert.deepEqual(collectionLevel(stats), { xp: 1500, level: 2, current: 500, next: 1000, rank: 'Iniciante' });
  assert.equal(collectionLevel({ minutes: 24000, unlocked: null, completed: null }).rank, 'Jogador');
  assert.equal(collectionLevel({ minutes: 84000 }).rank, 'Veterano');
  assert.equal(collectionLevel({ minutes: 174000 }).rank, 'Lenda');
  assert.equal(collectionLevel(null), null);
  assert.equal(collectionLevel({ minutes: Infinity, unlocked: null }).xp, 0);
});

test('Progress never presents a rounded incomplete game as 100% and preserves unavailable states', () => {
  const game = { platforms: [{ achievement_total: 570, achievement_unlocked: 569, achievement_status: 'available' }] };
  assert.equal(gameAchievementSummary(game).percent, 99);
  assert.equal(gameAchievementSummary(game).completed, false);
  assert.equal(gameAchievementSummary({ platforms: [{ achievement_total: null, achievement_unlocked: null }] }).percent, null);
  assert.equal(gameAchievementSummary({ platforms: [{ achievement_total: 0, achievement_unlocked: 0, achievement_status: 'none' }] }).none, true);
  const complete = gameAchievementSummary({ platforms: [{ achievement_total: 2, achievement_unlocked: 2, achievement_status: 'unavailable' }] });
  assert.equal(complete.completed, true);
  assert.equal(complete.stale, true);
});

test('Visual badges require actual milestones and portrait URLs only use a valid Steam AppID', () => {
  const badges = collectionBadges([{ minutes: 5999 }], { completed: 0, games: 9 });
  assert(badges.every(b => !b.unlocked));
  assert(collectionBadges([{ minutes: 6000 }], { completed: 1, games: 10 }).every(b => b.unlocked));
  assert.deepEqual(collectionPortraitSources({ platforms: [{ provider: 'steam', external_id: '620' }] }), ['https://cdn.akamai.steamstatic.com/steam/apps/620/library_600x900.jpg','https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/620/library_600x900.jpg','https://cdn.akamai.steamstatic.com/steam/apps/620/header.jpg','https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/620/header.jpg']);
  assert.deepEqual(collectionPortraitSources({ platforms: [{ provider: 'steam', external_id: '../invalid' }], cover_url: null }), []);
});
