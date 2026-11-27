import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameCoverResolver } from '../lib/game-covers.js';

const game = { name: 'Example', slug: 'example', background_image: 'https://media.rawg.io/media/games/example.jpg' };
const cover = { url: 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co123.jpg', source: 'IGDB' };
test('official store links carry a verified Steam portrait fallback without trusting lookalike domains',async()=>{
 const resolve=createGameCoverResolver({loadGame:async()=>game,findCover:async()=>null,loadStores:async()=>[{url:'https://store.steampowered.com.evil.test/app/999/'},{url:'https://store.steampowered.com/app/620/'}]});assert.equal((await resolve('1')).body.steamAppId,'620');
});

test('game covers share concurrent requests and expire positive and missing matches separately', async () => {
  for (const [match, ttl] of [[cover, 3600000], [null, 300000]]) {
    let time = 0, loads = 0;
    const resolve = createGameCoverResolver({ now: () => time, loadGame: async () => { loads++; return game; }, findCover: async () => match });
    const [first, second] = await Promise.all([resolve('1'), resolve('1')]);
    assert.deepEqual(first, second);
    assert.equal(loads, 1);
    assert.deepEqual(first.body.cover, match);
    assert.equal(first.body.fallback.source, 'RAWG');
    time = ttl - 1; await resolve('1'); assert.equal(loads, 1);
    time = ttl; await resolve('1'); assert.equal(loads, 2);
  }
});

test('IGDB failures retain current RAWG artwork and allow the next request to recover', async () => {
  for (const [reason, status] of [['IGDB_CONFIG', 503], ['IGDB_UNAVAILABLE', 502]]) {
    let calls = 0;
    const resolve = createGameCoverResolver({ loadGame: async () => game, findCover: async () => {
      if (++calls === 1) throw new Error(reason);
      return cover;
    } });
    const failed = await resolve('1');
    assert.equal(failed.status, status);
    assert.equal(failed.body.cover, null);
    assert.equal(failed.body.fallback.url, game.background_image);
    assert.equal((await resolve('1')).body.cover, cover);
  }
});

test('RAWG failures are retried and fallback URLs only accept HTTPS RAWG images', async () => {
  let loads = 0;
  const resolve = createGameCoverResolver({ loadGame: async () => {
    if (++loads === 1) throw new Error('RAWG_UNAVAILABLE');
    return game;
  }, findCover: async () => null });
  await assert.rejects(() => resolve('1'), /RAWG_UNAVAILABLE/);
  assert.equal((await resolve('1')).body.fallback.source, 'RAWG');
  for (const url of [null, 'http://media.rawg.io/test.jpg', 'https://media.rawg.io.evil.test/test.jpg', 'javascript:alert(1)']) {
    const invalid = createGameCoverResolver({ loadGame: async () => ({ ...game, background_image: url }), findCover: async () => null });
    assert.equal((await invalid('1')).body.fallback, null);
  }
});

test('cover cache evicts older games at its configured limit', async () => {
  let loads = 0;
  const resolve = createGameCoverResolver({ limit: 2, loadGame: async () => { loads++; return game; }, findCover: async () => cover });
  await resolve('1'); await resolve('2'); await resolve('3'); await resolve('2');
  assert.equal(loads, 3);
  await resolve('1'); assert.equal(loads, 4);
});
