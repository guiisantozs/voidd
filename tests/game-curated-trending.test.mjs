import test from 'node:test';
import assert from 'node:assert/strict';
import entries from '../game-trending.config.js';
import {loadCuratedTrending} from '../lib/game-curated-trending.js';
const now=new Date('2026-10-27T12:00:00Z');
const work=async(category,id)=>({id:Number(id),categoria:category,titulo:`Provider ${id}`,poster:'https://media.rawg.io/media/games/example.jpg',estreia:null,ano:'',generos:[]});
const findCover=async game=>({url:`https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co${game.id}.jpg`,source:'IGDB',width:1200,height:1600});
const loadStores=async()=>[{url:'https://store.steampowered.com/app/620/'}];
test('the 17 explicitly requested identities keep their order, including the Valve game and Phantom Liberty expansion',async()=>{
 assert.equal(entries.length,17);assert.equal(new Set(entries.map(e=>e.id)).size,17);assert.equal(entries[0].title,'Mixtape');assert.equal(entries.at(-1).title,'Silent Hill: Townfall');
 assert.equal(entries.find(e=>e.title==='Deadlock').id,998676);assert.equal(entries.find(e=>e.title.includes('Phantom Liberty')).id,846303);
 const data=await loadCuratedTrending({interval:0,now,loadWork:work,findCover,loadStores});assert.equal(data.games.length,17);assert.deepEqual(data.games.map(g=>g.id),entries.map(e=>e.id));assert.deepEqual(data.games.map(g=>g.titulo),entries.map(e=>e.title));assert.ok(data.games.every(g=>g.officialCover?.width===1200&&g.steamAppId==='620'));assert.equal(data.curated,true);assert.equal(data.basis.window,'curated');assert.equal(data.partial,false);assert.ok(data.games.every(g=>g.estreia===null));
});
test('successful public metadata and prefetched covers are reused within the day instead of fetching them on each retry',async()=>{
 let calls=0,covers=0;const loadWork=async(...args)=>{calls++;return work(...args);},cover=async game=>{covers++;return findCover(game);};
 const first=await loadCuratedTrending({interval:0,now,loadWork,findCover:cover,loadStores});const next=await loadCuratedTrending({interval:0,now:new Date(+now+60000),previous:first,loadWork,findCover:cover,loadStores});assert.equal(calls,17);assert.equal(covers,17);assert.deepEqual(next.games,first.games);
});
test('failed or mismatched identities never substitute another game; transient failures retain the same last-good card',async()=>{
 const custom=entries.slice(0,2),first=await loadCuratedTrending({interval:0,now,entries:custom,loadWork:work,findCover,loadStores});
 const fail=async(category,id)=>{if(Number(id)===custom[0].id)throw Error('OFFLINE');return work(category,id);};
 const next=await loadCuratedTrending({interval:0,now:new Date(+now+86400000),previous:first,entries:custom,loadWork:fail,findCover,loadStores});assert.equal(next.games.length,2);assert.equal(next.games[0].id,custom[0].id);assert.equal(next.games[0].stale,true);assert.equal(next.partial,true);
 const missing=await loadCuratedTrending({interval:0,now,entries:custom,loadWork:async(category,id)=>Number(id)===custom[0].id?{...await work(category,id),id:999999}:work(category,id),findCover,loadStores});assert.equal(missing.games.length,2);assert.deepEqual(missing.unavailable,[custom[0].title]);assert.equal(missing.games[0].id,custom[0].id);assert.equal(missing.games[0].nota,null);assert.equal(missing.games[0].estreia,null);assert.ok(!missing.games.some(g=>g.id===999999));
});
