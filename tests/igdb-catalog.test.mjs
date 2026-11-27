import test from 'node:test';
import assert from 'node:assert/strict';
import {createIGDBCatalog,normalizeIGDBGame,igdbIdentity} from '../lib/igdb-catalog.js';
import {decodeIGDBGameId,igdbGameId,useIGDBCatalog} from '../lib/game-provider.js';
import {createPublicGameCache} from '../lib/game-public-cache.js';
import {gameCoverCandidates,officialGameCover} from '../lib/game-cover-client.js';
import {keyArtCandidates} from '../lib/game-key-art.js';
import {listEntry} from '../lib/lists.js';
import {gameReviewHref} from '../lib/game-review-navigation.js';
import {favoriteSnapshot} from '../lib/profile.js';
import {validateWork} from '../lib/details.js';

const row={id:777777,name:'Fixture Game',slug:'fixture-game',first_release_date:Date.parse('2025-04-04')/1000,total_rating:88,total_rating_count:120,cover:{image_id:'cover_fixture',width:1600,height:2400},artworks:[{image_id:'art_fixture',width:3840,height:2160}],screenshots:[{image_id:'scene_fixture',width:1920,height:1080}],genres:[{name:'Adventure'}],platforms:[{name:'PlayStation 5'}],websites:[{url:'https://store.steampowered.com/app/620/'}]};
const directCache=async(key,load)=>key==='legacy-steam-crosswalk-v1'?[]:load();

test('IGDB identity namespace never aliases a raw provider ID; known legacy identities survive',()=>{
 assert.equal(decodeIGDBGameId(igdbGameId(14593)),14593);
 assert.equal(decodeIGDBGameId(14593),null);
 assert.equal(igdbGameId(0),null);assert.equal(igdbGameId(1000000000),null);
 assert.equal(decodeIGDBGameId('https://example.com'),null);
 assert.equal(igdbIdentity({...row,id:14593,name:'Hollow Knight'}),9767);
 assert.equal(igdbIdentity({...row,id:305157,name:'Mixtape'}),983374);
 assert.equal(igdbIdentity({...row,id:223860,name:'Mixtape'}),igdbGameId(223860));
 const game=normalizeIGDBGame(row);
 assert.equal(game.id,9000777777);assert.equal(game.rawgId,undefined);assert.equal(game.igdbId,777777);
 assert.ok(validateWork('jogos',String(game.id)));
 assert.match(gameReviewHref(game.id),/9000777777/);
 assert.equal(listEntry(game).external_id,String(game.id));
 assert.equal(favoriteSnapshot(game).officialCover.url,game.officialCover.url);
});

test('official portrait and landscape artwork reuse the shared image pipeline and honest /5 rating',()=>{
 const game=normalizeIGDBGame(row);
 assert.equal(game.nota,4.4);
 assert.match(game.poster,/t_cover_big_2x\/cover_fixture/);
 assert.match(game.backdrop,/t_1080p_2x\/art_fixture/);
 assert.equal(gameCoverCandidates(game,{loading:false})[0].kind,'portrait');
 assert.equal(keyArtCandidates(game,null)[0].portrait,false);
 assert.ok(officialGameCover(game.officialCover));
 assert.equal(game.steamAppId,'620');
 assert.equal(normalizeIGDBGame({...row,total_rating_count:0}).nota,null);
 assert.equal(normalizeIGDBGame({...row,artworks:[],screenshots:[]}).backdrop,null);
 assert.equal(normalizeIGDBGame({...row,total_rating:0}).nota,0);
});

test('IGDB search preserves filters, accurate counts and pagination without RAWG calls',async()=>{
 const calls=[];
 const source=createIGDBCatalog({cache:directCache,request:async(endpoint,body)=>{calls.push({endpoint,body});assert.equal(endpoint,'multiquery');return [{name:'items',result:Array.from({length:19},(_,i)=>({...row,id:row.id+i}))},{name:'total',count:900}];}});
 const data=await source.search({q:'',platform:'PlayStation',genre:'adventure',year:'2025',page:2,order:'rating'});
 assert.match(calls[0].body,/platforms = \(7,8,9,38,46,48,167\)/);
 assert.match(calls[0].body,/genres = \(31\)/);assert.match(calls[0].body,/offset 18/);
 assert.equal(data.pagination.total,900);assert.equal(data.pagination.hasNext,true);assert.equal(data.jogos.length,18);
 await assert.rejects(source.search({tag:'1'}),/PROVIDER_FILTER_UNAVAILABLE/);
});

test('full-text search escapes input, avoids unsupported count and never invents totals',async()=>{
 let query;
 const source=createIGDBCatalog({cache:directCache,request:async(endpoint,body)=>{query=body;assert.equal(endpoint,'games');return [row];}});
 const q='Game "; limit 500;';
 const data=await source.search({q,page:1,platform:'all',genre:'all',order:'popular'});
 assert.ok(query.startsWith(`search ${JSON.stringify(q)};`));
 assert.equal(data.totalIsLowerBound,true);assert.equal(data.pagination.hasNext,false);
});

test('IGDB-only details remain addressable and never borrow another numeric RAWG identity',async()=>{
 const source=createIGDBCatalog({cache:directCache,request:async(endpoint,body)=>{assert.match(body,/where id=777777/);return [row];}});
 assert.equal((await source.detail(String(igdbGameId(row.id)))).titulo,row.name);
 await assert.rejects(source.detail('8888888'),{message:'CATALOG_ID_UNMAPPED'});
});

test('public cache coalesces, persists across cold instances, serves last good data and never stores errors',async()=>{
 let now=1000,calls=0,writes=0;const database=new Map();
 const options={clock:()=>now,read:async k=>database.get(k),write:async(k,value,ttl)=>{writes++;database.set(k,{value,expires_at:new Date(now+ttl).toISOString(),updated_at:new Date(now).toISOString()});}};
 const cache=createPublicGameCache(options),load=async()=>{calls++;return [row];};
 const [a,b]=await Promise.all([cache('fixture',load,{ttl:100}),cache('fixture',load,{ttl:100})]);
 assert.equal(a,b);assert.equal(calls,1);assert.equal(writes,1);
 const cold=createPublicGameCache(options);await cold('fixture',load);assert.equal(calls,1);
 now=1200;const stale=await cold('fixture',async()=>{throw Error('offline');},{stale:10000});assert.deepEqual(stale,[row]);assert.equal(writes,1);
 now=20000;await assert.rejects(createPublicGameCache(options)('fixture',async()=>{throw Error('offline');},{stale:10000}),/offline/);
 await assert.rejects(cache('empty-failure',async()=>{throw Error('provider');}),/provider/);assert.equal(writes,1);
 assert.ok([...database.keys()].every(k=>/^[a-f0-9]{64}$/.test(k)));
});
