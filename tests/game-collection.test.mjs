import test from 'node:test';
import assert from 'node:assert/strict';
import { achievementSpotlights, playedSteamGames, steamAppId, steamGameInput, groupCollection, collectionStats, filterCollection } from '../lib/game-collection.js';
import { createSteamProvider } from '../lib/steam-collection-provider.js';
import { collectionFailure, syncCollectionBatch, recoverCollectionGame, readCollection } from '../lib/game-collection-server.js';

test('Missing Steam game input accepts only a store AppID and never an arbitrary URL or Steam account', () => {
 assert.equal(steamGameInput(' 367520 '), '367520');
 assert.equal(steamGameInput('https://store.steampowered.com/app/367520/Hollow_Knight/?l=brazilian'), '367520');
 for (const value of ['', '0', '-1', '1.5', '76561198000000001', '4294967296', 'https://evil.test/app/367520/', 'javascript:alert(1)']) assert.equal(steamGameInput(value), null);
});

test('Steam discovers recently played shared games without requiring ownership or counting never played titles', async () => {
 const provider = createSteamProvider({ key: 'fixture', rawgKey: '', fetcher: async input => {
  const url = new URL(input);
  const recent = url.pathname.includes('GetRecentlyPlayedGames');
  if (recent) assert.equal(url.searchParams.get('count'), '0');
  return { ok: true, json: async () => recent ? { response: { games: [{ appid: 367520, name: 'Hollow Knight', playtime_forever: 120 }] } } : { response: { game_count: 1, games: [{ appid: 620, playtime_forever: 0 }] } } };
 } });
 assert.deepEqual((await provider.played('76561198000000001')).map(game=>game.appid), ['367520']);
});

test('Old shared games can be recovered from actual unlocked achievements without fabricated playtime or dates', async () => {
 for (const [appid, title] of [['367520', 'Hollow Knight'], ['2552430', 'KINGDOM HEARTS HD 1.5+2.5 ReMIX']]) {
  const identity = '76561198000000001';
  const provider = createSteamProvider({ key: 'fixture', rawgKey: '', fetcher: async input => {
   const url = new URL(input);
   if (url.searchParams.has('steamid')) assert.equal(url.searchParams.get('steamid'), identity);
   const body = url.pathname.includes('GetOwnedGames') ? { response: { game_count: 0 } }
    : url.pathname.includes('GetRecentlyPlayedGames') ? { response: { games: [] } }
    : url.pathname.includes('GetSchemaForGame') ? { game: { availableGameStats: { achievements: [{ name: 'PLAYED', displayName: 'Confirmed activity' }] } } }
    : url.pathname.includes('GetPlayerAchievements') ? { playerstats: { success: true, achievements: [{ apiname: 'PLAYED', achieved: 1, unlocktime: 1234567890 }] } }
    : url.pathname.includes('appdetails') ? { [appid]: { data: { type: 'game', name: title } } } : {};
   return { ok: true, json: async () => body };
  } });
  const game = await provider.recover(appid, identity);
  assert.equal(game.title, title); assert.equal(game.evidence, 'achievement');
  assert.equal(game.minutes, null); assert.equal(game.last_played_at, null); assert.equal(game.achievement_unlocked, 1);
 }
});

test('Missing games with locked, unavailable or partial achievements are not imported as played', async () => {
 for (const progress of [{ success: true, achievements: [{ apiname: 'A', achieved: 0 }] }, { success: false }, { success: true, achievements: [{ apiname: 'OTHER', achieved: 1 }] }]) {
  const provider = createSteamProvider({ key: 'fixture', rawgKey: '', fetcher: async input => {
   const url = new URL(input);
   const body = url.pathname.includes('GetOwnedGames') ? { response: { game_count: 0 } }
    : url.pathname.includes('GetSchemaForGame') ? { game: { availableGameStats: { achievements: [{ name: 'A' }] } } }
    : url.pathname.includes('GetPlayerAchievements') ? { playerstats: progress } : {};
   return { ok: true, json: async () => body };
  } });
  await assert.rejects(provider.recover('71000010', '76561198000000001'), /STEAM_ACTIVITY_UNCONFIRMED/);
 }
});

test('Recovery binds the requested AppID to the authenticated owner connection and keeps the durable commit protections', async () => {
 const actor='owner', steam='76561198000000001', calls=[];
 const game={appid:'367520', title:'Hollow Knight', minutes:null, last_played_at:null, evidence:'achievement', achievement_unlocked:1};
 const admin={
  from(table){assert.equal(table,'void_steam_connections');const chain={select(){return chain;},eq(key,value){assert.equal(key,'user_id');assert.equal(value,actor);return chain;},maybeSingle:async()=>({data:{steam_id:steam,connected_at:'2026-10-29'}})};return chain;},
  async rpc(name,args){calls.push({name,args});return {data:name==='void_collection_claim'?(args.p_plan?{id:'run',lease:'lease',source_account:steam,position:0,plan:args.p_plan}:null):{done:true}};}
 };
 const factory=()=>({recover:async(appid,identity)=>{assert.equal(appid,game.appid);assert.equal(identity,steam);return game;}});
 assert.equal((await recoverCollectionGame(admin,actor,game.appid,{providerFactory:factory})).done,true);
 assert.equal(calls.find(row=>row.args.p_plan).args.p_expected_connection,'2026-10-29');
 assert.deepEqual(calls.find(row=>row.name==='void_collection_commit').args.p_games,[game]);
 await assert.rejects(recoverCollectionGame(admin,actor,'https://evil.test',{providerFactory:factory}),/INVALID/);
});

test('Recovery never replaces an unfinished sync and releases a claimed lease before reporting busy', async () => {
 const calls=[];
 const admin={async rpc(name,args){calls.push({name,args});return {data:name==='void_collection_claim'?{id:'running',lease:'lease'}:null};}};
 await assert.rejects(recoverCollectionGame(admin,'owner','367520',{providerFactory:()=>({recover(){throw Error('Should not query another plan');}})}),/SYNC_BUSY/);
 assert.deepEqual(calls.map(row=>row.name),['void_collection_claim','void_collection_release']);
});

test('Collection reads default to public only when no preference exists and preserve an explicit private choice', async () => {
 for (const visibility of [null,'private','public']) {
  const client={
   rpc:async(name)=>({data:name==='void_collection_access'?true:1}),
   from(table){const data=table==='void_collection_preferences'?(visibility?{visibility}:null):null;
    const chain={select(){return chain;},eq(){return chain;},order(){return chain;},maybeSingle:async()=>({data}),range:async()=>({data:[]}),then(resolve){return Promise.resolve({data:[]}).then(resolve);}};return chain;}
  };
  assert.equal((await readCollection(client,'owner',false)).visibility,visibility||'public');
 }
 await assert.rejects(readCollection({rpc:async()=>({data:false})},'owner',false),/COLLECTION_PRIVATE/);
});

test('A single server Steam key imports different accounts without sharing their owned games or progress', async () => {
 const first = '76561198000000001', second = '76561198000000002', requests = [];
 const provider = createSteamProvider({ key: ' server-fixture-key\n', rawgKey: '', fetcher: async input => {
  const url = new URL(input); requests.push(url);
  assert.equal(url.searchParams.get('key'), 'server-fixture-key');
  const steamId = url.searchParams.get('steamid');
  assert([first, second].includes(steamId));
  const body = url.pathname.includes('GetOwnedGames') ? { response: { game_count: 1, games: [{ appid: steamId === first ? 620 : 570, name: steamId === first ? 'Portal 2' : 'Dota 2', playtime_forever: 10 }] } } : { response: { games: [] } };
  return { ok: true, json: async () => body };
 } });
 assert.deepEqual((await provider.played(first)).map(game => game.appid), ['620']);
 assert.deepEqual((await provider.played(second)).map(game => game.appid), ['570']);
 assert.deepEqual((await provider.played(first)).map(game => game.appid), ['620']);
 assert.equal(requests.length, 6, 'Account-specific library requests are never cached globally');
});

test('Missing server key stops before creating a job and never asks the visitor for a key', async () => {
 for (const key of ['', '  \n', 'cole_sua_chave_aqui']) {
  let touched = false;
  await assert.rejects(syncCollectionBatch({ rpc() { touched = true; } }, 'second-user', { providerFactory: () => createSteamProvider({ key }) }), /STEAM_KEY_REQUIRED/);
  assert.equal(touched, false);
 }
 const res = { status(value) { this.statusCode = value; return this; }, json(body) { this.body = body; } };
 collectionFailure(res, Error('STEAM_KEY_REQUIRED'));
 assert.equal(res.statusCode, 503);
 assert.equal(res.body.code, 'STEAM_KEY_REQUIRED');
 assert.match(res.body.message, /não precisa gerar nenhuma chave/);
 collectionFailure(res, Error('Unexpected upstream URL with a secret'));
 assert.equal(res.body.code, 'COLLECTION_UNAVAILABLE');
 assert(!JSON.stringify(res.body).includes('secret'));
});

test('A second VOID account imports only the Steam identity resolved by the server for that owner', async () => {
 for (const [actor, steamId, appid] of [['first-user', '76561198000000001', '620'], ['second-user', '76561198000000002', '570']]) {
  const calls = [], run = { id: actor + '-run', lease: actor + '-lease', source_account: steamId, position: 0, plan: [{ appid, title: 'Fixture', minutes: 10 }] };
  const admin = {
   async rpc(name, args) {
    calls.push({ name, args }); assert.equal(args.p_user, actor);
    if (name === 'void_collection_claim') return { data: args.p_plan ? run : null };
    return { data: { done: true } };
   },
   from(table) { const chain = { select() { return chain; }, eq() { return chain; }, order() { return chain; }, range: async()=>({data:[]}), async maybeSingle() { return { data: table === 'void_steam_connections' ? { steam_id: steamId, connected_at: '2026-10-27' } : null }; } }; return chain; },
  };
  const result = await syncCollectionBatch(admin, actor, { providerFactory: () => ({
   async played(id) { assert.equal(id, steamId); return run.plan; },
   async enrich(game, id) { assert.equal(id, steamId); assert.equal(game.appid, appid); return game; },
  }) });
  assert.equal(result.done, true);
  assert.equal(calls.find(call => call.args.p_plan)?.args.p_expected_account, steamId);
  assert.equal(calls.find(call => call.name === 'void_collection_commit')?.args.p_games[0].appid, appid);
 }
});

test('Private libraries and rejected application keys produce separate errors and never become empty imports', async () => {
 for (const [status, body, expected] of [[200, { response: {} }, 'STEAM_PRIVATE'], [403, {}, 'STEAM_ACCESS'], [429, {}, 'STEAM_LIMIT']]) {
  const provider = createSteamProvider({ key: 'server-fixture-key', rawgKey: '', fetcher: async () => ({ ok: status === 200, status, json: async () => body }) });
  await assert.rejects(provider.played('76561198000000002'), new RegExp(expected));
 }
});

test('Steam import requires observed playtime or genuine last activity, includes free games and deduplicates', () => {
 const now = Date.now();
 const games = playedSteamGames({ game_count: 5, games: [
  { appid: 1, name: 'Purchased only', playtime_forever: 0 }, { appid: 2, name: 'Played free', playtime_forever: 12 },
  { appid: 3, name: 'Started', playtime_forever: 0, rtime_last_played: Math.floor(now / 1000) - 1 },
  { appid: 4, name: 'Unknown' }, { appid: 5, name: 'Future timestamp', playtime_forever: 0, rtime_last_played: Math.floor(now / 1000) + 100 },
 ] }, [{ appid: 2, playtime_forever: 20 }], now);
 assert.deepEqual(games.map(g => g.appid), ['2', '3']);
 assert.equal(games[0].minutes, 20);
 assert.equal(games[1].evidence, 'last_played');
 assert.throws(() => playedSteamGames({}));
 assert.throws(() => playedSteamGames({ game_count: 2, games: [] }));
 assert.deepEqual(playedSteamGames({ game_count: 0 }), []);
});
test('Canonical grouping is based on verified identity, keeps platform progress separate and never invents achievements', () => {
 const game = { id: 'same', title: 'Game', rawg_id: 42 };
 const rows = [
  { provider: 'steam', playtime_minutes: 60, achievement_total: 10, achievement_unlocked: 10, platform_game: { game } },
  { provider: 'xbox', playtime_minutes: 30, achievement_total: null, achievement_unlocked: null, platform_game: { game } },
  { provider: 'steam', playtime_minutes: null, achievement_total: null, achievement_unlocked: null, platform_game: { game: { ...game, id: 'remaster', title: 'Game Remastered' } } },
 ];
 const groups = groupCollection(rows);
 assert.equal(groups.length, 2); assert.equal(groups[0].platforms.length, 2); assert.equal(groups[0].minutes, 90);
 assert.deepEqual(collectionStats(rows, 1), { games: 2, connected: 1, minutes: 90, completed: 1, unlocked: 10, unknownAchievements: 2 });
 assert.equal(collectionStats([rows[2]], 0).unlocked, null);
 assert.equal(filterCollection(groups, 'remastered', 'steam', 'name').length, 1);
 assert.equal(steamAppId('https://store.steampowered.com/app/620/Portal_2/'), '620');
 assert.equal(steamAppId('https://evil.example/app/620/'), null);
});
test('Steam provider uses public endpoints, includes played F2P, excludes known software and reports unknown progress', async () => {
 const paths = [];
 const provider = createSteamProvider({ key: 'test-only-not-a-real-key', rawgKey: '', fetcher: async input => {
  const url = new URL(input); paths.push(url);
  let result;
  if (url.pathname.includes('GetOwnedGames')) { assert.equal(url.searchParams.get('include_played_free_games'), 'true'); result = { response: { game_count: 1, games: [{ appid: 71000001, name: 'Fixture', playtime_forever: 5 }] } }; }
  else if (url.pathname.includes('GetRecentlyPlayedGames')) result = { response: { games: [] } };
  else if (url.pathname.includes('appdetails')) result = { 71000001: { data: { type: 'tool' } }, 71000002: { data: { type: 'game', name: 'Unknown achievements' } } };
  else result = {};
  return { ok: true, json: async () => result };
 } });
 const played = await provider.played('fixture'); assert.equal(played.length, 1);
 assert.equal((await provider.enrich(played[0], 'fixture')).excluded, true);
 const unknown = await provider.enrich({ appid: '71000002', title: 'Other', minutes: 2, evidence: 'playtime' }, 'fixture');
 assert.equal(unknown.achievement_total, null); assert.equal(unknown.achievement_unlocked, null); assert.equal(unknown.achievement_status, 'unavailable');
 assert(paths.every(url => ['api.steampowered.com', 'store.steampowered.com'].includes(url.hostname)));
});
test('Steam achievement progress requires a complete player response; global rarity is optional', async () => {
 const provider = createSteamProvider({ key: 'fixture', rawgKey: '', fetcher: async input => {
  const url = new URL(input);
  const result = url.pathname.includes('GetSchemaForGame') ? { game: { availableGameStats: { achievements: [{ name: 'A', displayName: 'Achievement A' }, { name: 'B', displayName: 'Achievement B' }] } } }
   : url.pathname.includes('GetPlayerAchievements') ? { playerstats: { success: true, achievements: [{ apiname: 'A', achieved: 1, unlocktime: 1000 }, { apiname: 'B', achieved: 0, unlocktime: 0 }] } }
    : url.pathname.includes('GetGlobalAchievement') ? { achievementpercentages: { achievements: [{ name: 'A', percent: 3.5 }] } } : {};
  return { ok: true, json: async () => result };
 } });
 const game = await provider.enrich({ appid: '71000003', title: 'Fixture', minutes: 1, evidence: 'playtime' }, 'fixture');
 assert.equal(game.achievement_total, 2); assert.equal(game.achievement_unlocked, 1);
 assert.equal(game.definitions[0].global_percent, 3.5); assert.equal(game.definitions[1].global_percent, null);
 assert.equal(game.achievements[1].unlocked_at, null);
});
test('Failed/private Steam requests never commit an empty collection; batch persistence never touches reviews/library', async () => {
 const calls = [];
 const admin = { rpc: async (name, args) => { calls.push({ name, args }); return { data: null }; }, from: table => {
  calls.push({ table }); const chain = { select() { return chain; }, eq() { return chain; }, maybeSingle: async () => ({ data: { steam_id: 'fixture', connected_at: '2026-01-01' } }) }; return chain;
 } };
 await assert.rejects(syncCollectionBatch(admin, 'user', { providerFactory: () => ({ played: async () => { throw Error('STEAM_PRIVATE'); } }) }), /STEAM_PRIVATE/);
 assert(!calls.some(c => c.name === 'void_collection_commit'));
 assert(!calls.some(c => ['void_records', 'lists'].includes(c.table)));
});

test('RAWG mapping requires a matching Steam store URL, never merely the same title', async () => {
 const provider = createSteamProvider({ key: 'fixture', rawgKey: 'fixture', fetcher: async input => {
  const url = new URL(input);
  const result = url.hostname === 'api.rawg.io' && url.pathname.endsWith('/stores')
   ? { results: [{ url: 'https://store.steampowered.com/app/71000005/Different_Edition/' }] }
   : url.hostname === 'api.rawg.io' ? { results: [{ id: 123, name: 'Same title' }] } : {};
  return { ok: true, json: async () => result };
 } });
 const unmatched = await provider.enrich({ appid: '71000004', title: 'Same title', minutes: 1, evidence: 'playtime' }, 'fixture');
 assert.equal(unmatched.rawg_id, null);
 const matched = await provider.enrich({ appid: '71000005', title: 'Same title', minutes: 1, evidence: 'playtime' }, 'fixture');
 assert.equal(matched.rawg_id, 123);
});

test('Achievement spotlight uses actual unlocks, dates and global percentages without inventing rarity', () => {
 const rows = [{ provider:'steam',external_id:'1',platform_game:{game:{id:'g',title:'Fixture'},definitions:[{key:'A',global_percent:3},{key:'B',global_percent:null},{key:'C',global_percent:1}]},achievements:[{key:'A',unlocked:true,unlocked_at:'2026-10-25'},{key:'B',unlocked:true,unlocked_at:null},{key:'C',unlocked:false,unlocked_at:null}] }];
 const result = achievementSpotlights(rows);
 assert.deepEqual(result.recent.map(a=>a.key),['A']);
 assert.deepEqual(result.rare.map(a=>a.key),['A']);
});
