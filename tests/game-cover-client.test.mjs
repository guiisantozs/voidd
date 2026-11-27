import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameCoverClient, gameCoverPresentation, gameCoverCandidates, gameCoverImageSet, officialGameCover, gameCoverId, gameSteamAppId, steamCoverArtwork } from '../lib/game-cover-client.js';
import { collectionCoverItem } from '../lib/collection-presentation.js';
import { favoriteAsGame } from '../lib/gamer-profile.js';
import { keyArtCandidates, publicStorePoster } from '../lib/game-key-art.js';
const cover = { url:'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co123.jpg',source:'IGDB' };
const fallback = { url:'https://media.rawg.io/media/games/game.jpg',source:'RAWG' };
const game = { id:42,categoria:'jogos',titulo:'Jogo',poster:fallback.url };
const response = (body={cover,fallback},ok=true)=>({ok,json:async()=>body});
function storage(){const map=new Map();return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value)};}
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}

test('poster resolution never shows RAWG while the official lookup is pending',()=>{
 assert.equal(gameCoverPresentation(game,{loading:true}).kind,'loading');
 assert.equal(gameCoverPresentation(game,{loading:false,data:{cover,fallback}}).url,cover.url);
 assert.equal(gameCoverPresentation(game,{loading:false,data:{cover:null,fallback}}).url,fallback.url);
 const failed=gameCoverPresentation(game,{loading:false,data:{cover,fallback}},{failed:[cover.url]});
 assert.equal(failed.kind,'landscape');assert.equal(failed.source,'RAWG');
 assert.equal(gameCoverPresentation(game,{loading:false,data:{cover:null,fallback}},{portraitOnly:true}).kind,'unavailable');
 assert.equal(gameCoverPresentation(game,{loading:false,data:{cover,fallback}},{failed:[cover.url,fallback.url]}).kind,'unavailable');
});
test('server-verified Steam identity restores portrait quality when no IGDB cover exists',()=>{
 const resolved=gameCoverPresentation(game,{loading:false,data:{cover:null,fallback,steamAppId:'620'}});assert.equal(resolved.source,'Steam');assert.equal(resolved.kind,'portrait');assert.match(resolved.url,/620\/library_600x900.jpg$/);
});
test('verified official seeds render immediately and editorial Steam art precedes RAWG fallbacks',()=>{
 assert.equal(gameCoverPresentation({...game,officialCover:cover},{loading:true}).url,cover.url);
 const steam='https://cdn.akamai.steamstatic.com/steam/apps/620/header.jpg';
 assert.equal(gameCoverPresentation({...game,backdrop:steam},{loading:true}).kind,'loading');
 assert.equal(gameCoverPresentation({...game,backdrop:steam},{loading:false,data:{fallback}}).source,'Steam');
 const steamImages=gameCoverCandidates({...game,backdrop:steam},{loading:false,data:{fallback}}).filter(image=>image.source==='Steam');
 assert.equal(gameCoverPresentation({...game,backdrop:steam},{loading:false,data:{fallback}},{failed:steamImages.map(image=>image.url)}).source,'RAWG');
});

test('collection UUIDs never become RAWG IDs; a serialized favorite retains all same-game fallback images',()=>{
 const favorite={collection_id:'59a979ef-f2b2-441a-83ea-73cf58f20b70',rawg_id:4200,steam_appid:'620',title:'Portal 2',cover_url:'https://cdn.akamai.steamstatic.com/steam/apps/620/header.jpg',rawg_background:fallback.url,rawg_additional:'https://media.rawg.io/media/screenshots/second.jpg'};
 const before=JSON.stringify(favorite),item=collectionCoverItem(favoriteAsGame(JSON.parse(before)));
 assert.equal(item.id,'4200');assert.equal(item.steamAppId,'620');assert.equal(JSON.stringify(favorite),before);
 const candidates=gameCoverCandidates(item,{loading:false,data:{cover,fallback}});
 assert.equal(candidates[0].source,'IGDB');assert.equal(candidates[1].kind,'portrait');assert.equal(candidates[1].source,'Steam');
 const failed=[];for(const candidate of candidates){assert.equal(gameCoverPresentation(item,{loading:false,data:{cover,fallback}},{failed}).url,candidate.url);failed.push(candidate.url);}
 assert.ok(failed.includes(favorite.rawg_background));assert.ok(failed.includes(favorite.rawg_additional));assert.equal(gameCoverPresentation(item,{loading:false,data:{cover,fallback}},{failed}).kind,'unavailable');
 const unmapped=collectionCoverItem({...favorite,rawg_id:null});assert.equal(unmapped.id,null);assert.equal(gameCoverPresentation(unmapped,{loading:false}).source,'Steam');
});
test('Steam image recovery accepts only integrated provider assets and preserves verified IDs',()=>{
 const modern='https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/620/library_600x900.jpg';
 assert.equal(steamCoverArtwork(modern),modern);assert.equal(gameSteamAppId({cover_url:modern}),'620');
 for(const url of [modern.replace('https:','http:'),modern+'?token=private',modern.replace('shared.fastly.steamstatic.com','shared.fastly.steamstatic.com.evil.test'),modern.replace('https://','https://user:secret@'),'https://shared.fastly.steamstatic.com/private/file.jpg'])assert.equal(steamCoverArtwork(url),null);
 assert.equal(gameSteamAppId({steamAppId:'../620'}),null);
 assert.equal(gameSteamAppId({platforms:[{provider:'xbox',external_id:'620'}]}),null);
});
test('official portrait metadata and responsive sizes reject arbitrary hosts and retain the same image ID',()=>{
 for(const url of ['javascript:alert(1)','https://images.igdb.com.evil.invalid/igdb/image/upload/t_cover_big_2x/co123.jpg','https://images.igdb.com/igdb/image/upload/t_cover_big_2x/../co123.jpg'])assert.equal(officialGameCover({url}),null);
 const set=gameCoverImageSet(cover);assert.ok(set.includes('528w'));assert.ok(!set.includes('cover_small'));assert.equal((set.match(/co123.jpg/g)||[]).length,1);
 const large=gameCoverImageSet({...cover,width:1200,height:1600});assert.ok(large.includes('t_1080p/co123.jpg 810w'));assert.ok(!gameCoverImageSet({...cover,width:264,height:374}).includes('t_1080p'));
 assert.equal(gameCoverImageSet({url:fallback.url}),undefined);
 for(const id of [0,null,{},['42'],'42?evil=1','-1'])assert.equal(gameCoverId(id),null);
});
test('all consumers share one pending cover request and a warm cache',async()=>{
 let calls=0;const request=deferred(),client=createGameCoverClient({fetcher:async()=>{calls++;await request.promise;return response();},storage:()=>null});
 const first=client.load(42),second=client.load('42'),third=client.load(42,{priority:true});assert.equal(first,second);assert.equal(second,third);
 await Promise.resolve();assert.equal(calls,1);request.resolve();await first;
 assert.equal(client.peek(42).data.cover.url,cover.url);await client.load(42);assert.equal(calls,1);
});
test('public session metadata survives navigation/reload and excludes unrelated payload fields',async()=>{
 const store=storage(),client=createGameCoverClient({fetcher:async()=>response({cover,fallback,review:{private:true},user_id:'secret-account'}),storage:()=>store});
 await client.load('42');let requests=0;
 const restored=createGameCoverClient({fetcher:async()=>{requests++;return response();},storage:()=>store});
 assert.equal(restored.peek(42).data.cover.url,cover.url);await restored.load(42);assert.equal(requests,0);
 assert.ok(!store.getItem('void:game-covers:v2').includes('secret-account'));assert.ok(!store.getItem('void:game-covers:v2').includes('review'));
});
test('positive and missing covers expire separately; failures recover without persisting failed lookups',async()=>{
 for(const [body,ttl] of [[{cover,fallback},3600000],[{cover:null,fallback},300000]]){
  let time=0,calls=0;const client=createGameCoverClient({now:()=>time,fetcher:async()=>{calls++;return response(body);},storage:()=>null});
  await client.load(42);time=ttl-1;await client.load(42);assert.equal(calls,1);time=ttl;await client.load(42);assert.equal(calls,2);
 }
 let calls=0;const store=storage(),client=createGameCoverClient({fetcher:async()=>++calls===1?response({cover:null,fallback},false):response(),storage:()=>store});
 assert.equal((await client.load(42)).error,true);assert.equal(store.getItem('void:game-covers:v2'),null);
 await client.load(42,{force:true});assert.equal(client.peek(42).data.cover.url,cover.url);assert.equal(calls,2);
});
test('request scheduling limits concurrency and promotes a pending detail hero above other queued posters',async()=>{
 const gates=new Map(),order=[];let active=0,maximum=0;
 const client=createGameCoverClient({concurrency:1,storage:()=>null,fetcher:async url=>{const id=new URL(url,'https://void.invalid').searchParams.get('id');order.push(id);active++;maximum=Math.max(maximum,active);const gate=deferred();gates.set(id,gate);await gate.promise;active--;return response();}});
 const first=client.load(1),second=client.load(2),third=client.load(3);client.load(3,{priority:true});await Promise.resolve();assert.deepEqual(order,['1']);
 gates.get('1').resolve();await first;await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(order,['1','3']);
 gates.get('3').resolve();await third;await new Promise(resolve=>setImmediate(resolve));gates.get('2').resolve();await second;
 assert.deepEqual(order,['1','3','2']);assert.equal(maximum,1);
});
test('bounded caches, unavailable browser storage and invalid IDs do not break cover loading',async()=>{
 let calls=0;const client=createGameCoverClient({limit:2,fetcher:async()=>{calls++;return response();},storage:()=>{throw Error('Blocked');}});
 await client.load(1);await client.load(2);await client.load(3);assert.equal(client.peek(1),null);assert.equal(client.peek(3).data.cover.url,cover.url);
 await client.load('nope');assert.equal(calls,3);
 const corrupt=createGameCoverClient({storage:()=>({getItem:()=>'{',setItem:()=>{}}),fetcher:async()=>response()});assert.equal((await corrupt.load(42)).data.cover.url,cover.url);
});
test('hero waits for store resolution and then orders IGDB, Steam and RAWG consistently',()=>{
 const item={...game,storePoster:publicStorePoster([{url:'https://store.steampowered.com/app/620/'}])};
 const withArtwork={...cover,heroArtwork:{url:'https://images.igdb.com/igdb/image/upload/t_1080p_2x/art123.jpg',portrait:false,source:'IGDB'}};
 assert.deepEqual(keyArtCandidates(item,withArtwork,{pending:true}),[]);
 assert.deepEqual(keyArtCandidates({...game,storePoster:null},null,{pending:true}),[]);
 assert.deepEqual(keyArtCandidates(item,withArtwork).map(candidate=>candidate.source),['IGDB','Steam','Steam','RAWG']);
});
