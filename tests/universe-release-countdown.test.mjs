import test from 'node:test';
import assert from 'node:assert/strict';
import {universeReleaseDays} from '../lib/universe-release-countdown.js';
import {gameUniverseLandings} from '../config/game-universe-landings.js';
import {GTA_VI_ID} from '../lib/game-home-selection.js';

test('GTA universe media targets the same GTA VI catalog record as the home',()=>{
  assert.equal(String(gameUniverseLandings['grand-theft-auto'].mediaGame.id),GTA_VI_ID);
});

test('GTA countdown uses the announced calendar date and São Paulo day boundaries',()=>{
  const release=gameUniverseLandings['grand-theft-auto'].release.date;
  assert.equal(release,'2026-11-19');
  assert.equal(universeReleaseDays(release,Date.parse('2026-10-28T15:00:00Z')),22);
  assert.equal(universeReleaseDays(release,Date.parse('2026-11-19T02:59:59Z')),1);
  assert.equal(universeReleaseDays(release,Date.parse('2026-11-19T03:00:00Z')),0);
  assert.equal(universeReleaseDays(release,Date.parse('2026-11-21T03:00:00Z')),0);
  assert.equal(universeReleaseDays(release,NaN),null);
});
test('Zelda countdown targets Ocarina of Time 2026 and respects the local launch day',()=>{
  const zelda=gameUniverseLandings['the-legend-of-zelda'];
  assert.equal(zelda.release.date,'2026-11-05');
  assert.equal(zelda.mediaGame.id,1019942);
  assert.equal(universeReleaseDays(zelda.release.date,Date.parse('2026-10-28T15:00:00Z')),8);
  assert.equal(universeReleaseDays(zelda.release.date,Date.parse('2026-11-05T02:59:59Z')),1);
  assert.equal(universeReleaseDays(zelda.release.date,Date.parse('2026-11-05T03:00:00Z')),0);
});
