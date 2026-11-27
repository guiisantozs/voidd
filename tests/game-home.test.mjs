import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME_HOME_DAY,selectDailyGameHome,nextGameHomeDay} from '../lib/game-home-selection.js';
import {createGameHomeCache,loadGameHome,GAME_HOME_RETRY_MS} from '../lib/game-home.js';
import {GAME_HOME_STORAGE,gameHomeNextRefresh,readGameHomeSnapshot,storeGameHomeSnapshot,fetchGameHome,validGameHomeSnapshot} from '../lib/game-home-client.js';
import {createGameHighlightsHandler} from '../pages/api/game-highlights.js';
import {gameBanners} from '../lib/game-banners.js';
const now=new Date('2026-10-27T12:00:00Z');
const game=(id,extra={})=>({id,categoria:'jogos',titulo:`Fixture ${id}`,poster:'https://media.rawg.io/media/fixture.jpg',backdrop:'https://media.rawg.io/media/fixture.jpg',estreia:'2026-10-20',ano:'2026',catalogAdded:1000,catalogVotes:100,nota:4,generos:[],plataformas:[],...extra});
const pool=Array.from({length:45},(_,i)=>game(i+1));
const trend=async()=>({games:[game(400)],source:'Curadoria VOID',updatedAt:now.toISOString(),observedAt:now.toISOString(),curated:true,basis:{source:'RAWG',monthlyPlayers:false}});
const rawg=async({mode})=>({games:mode==='hype'?pool:mode==='recent'?[game(300)]:mode==='year'?pool.map(g=>({...g,id:g.id+500})):[game(301,{estreia:'2026-11-01'})],hasNext:false});
const allIds=data=>[...data.games,...data.featured.games].map(g=>String(g.id));

test('daily editions are stable, disjoint, rotate across days and exclude GTA VI by ID and alias',()=>{
 const candidates=[...pool,game(972995,{titulo:'Nome localizado'}),game(999,{titulo:'GTA 6'})];
 const first=selectDailyGameHome(candidates,{now}),same=selectDailyGameHome([...candidates].reverse(),{now:new Date(+now+3600000)});
 assert.deepEqual(allIds(first),allIds(same));assert.equal(first.games.length,4);assert.equal(first.featured.games.length,5);assert.equal(new Set(allIds(first)).size,9);assert.ok(!allIds(first).includes('972995'));assert.ok(!allIds(first).includes('999'));
 const tomorrow=selectDailyGameHome(candidates,{now:new Date(+now+GAME_HOME_DAY),previous:first});assert.ok(allIds(tomorrow).every(id=>!allIds(first).includes(id)));
 const cold=selectDailyGameHome(candidates,{now:new Date(+now+GAME_HOME_DAY)});assert.ok(allIds(cold).every(id=>!allIds(first).includes(id)));
 const fixed={id:'gta-vi',background:'/custom.jpg',logo:'/custom.png'},banners=gameBanners([fixed],[first.games[0],first.games[0],game(972995),...first.games]);assert.equal(banners[0],fixed);assert.equal(banners.length,5);assert.equal(new Set(banners.map(g=>g.id)).size,5);
 assert.equal(first.selectionExpiresAt,Date.parse('2026-10-28T00:00:00Z'));
});
test('sparse selections stay sparse without repeating banners or inventing fillers',()=>{
 const result=selectDailyGameHome(pool.slice(0,6),{now});assert.equal(result.games.length,4);assert.equal(result.featured.games.length,2);assert.equal(new Set(allIds(result)).size,6);
 assert.deepEqual(selectDailyGameHome([],{now}).games,[]);
});
test('small viable pools still rotate banners instead of freezing when the pool has nine games',()=>{
 for(let size=8;size<18;size++){
  const candidates=pool.slice(0,size),first=selectDailyGameHome(candidates,{now}),next=selectDailyGameHome(candidates,{now:new Date(+now+GAME_HOME_DAY),previous:first}),cold=selectDailyGameHome(candidates,{now:new Date(+now+GAME_HOME_DAY)});
  assert.ok(next.games.every(g=>!first.games.some(p=>p.id===g.id)),`warm pool ${size}`);assert.ok(cold.games.every(g=>!first.games.some(p=>p.id===g.id)),`cold pool ${size}`);
 }
});
test('provider expansion happens before accepting too few quality candidates',async()=>{
 const calls=[];const data=await loadGameHome({now,loadTrending:trend,loadRawg:async options=>{calls.push(options);return {games:options.mode==='hype'?(options.page===2?pool.slice(4,14):pool.slice(0,4)):[],hasNext:options.mode==='hype'};}});
 assert.ok(calls.some(o=>o.page===2));assert.equal(data.games.length,4);assert.equal(data.featured.games.length,5);assert.equal(new Set(allIds(data)).size,9);
});
test('cache coalesces requests, keeps an edition until UTC rollover, and refreshes without browser cache clearing',async()=>{
 let time=+now,calls=0;const cached=createGameHomeCache({clock:()=>time,load:async options=>{calls++;await Promise.resolve();return loadGameHome({...options,loadRawg:rawg,loadTrending:trend});}});
 const [first,same]=await Promise.all([cached(),cached()]);assert.equal(calls,1);assert.equal(first,same);
 time=nextGameHomeDay(now)-1;assert.equal(await cached(),first);assert.equal(calls,1);
 time=nextGameHomeDay(now)+1;const second=await cached();assert.equal(calls,2);assert.ok(allIds(second).every(id=>!allIds(first).includes(id)));
});
test('provider failures retain last good content and back off instead of hammering API or caching an empty success',async()=>{
 let time=+now,calls=0,fail=false;const cached=createGameHomeCache({clock:()=>time,load:async options=>{calls++;if(fail)throw Error('UPSTREAM');return loadGameHome({...options,loadRawg:rawg,loadTrending:trend});}});
 const first=await cached();time=first.refreshAt+1;fail=true;const old=await cached();assert.deepEqual(allIds(old),allIds(first));assert.equal(old.stale,true);await cached();assert.equal(calls,2);time+=GAME_HOME_RETRY_MS+1;await cached();assert.equal(calls,3);
 let attempts=0;const empty=createGameHomeCache({clock:()=>time,load:async()=>{attempts++;throw Error('CONFIG');}});await assert.rejects(empty(),/CONFIG/);await assert.rejects(empty(),/CONFIG/);assert.equal(attempts,1);
});
test('public last-good browser snapshot is versioned, optional, bounded and separate from accounts',async()=>{
 const data=await loadGameHome({now,loadRawg:rawg,loadTrending:trend}),values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 storeGameHomeSnapshot(storage,data);assert.equal(values.size,1);assert.ok(values.has(GAME_HOME_STORAGE));assert.deepEqual(readGameHomeSnapshot(storage,+now),data);
 assert.equal(validGameHomeSnapshot({...data,version:1},+now),false);assert.equal(validGameHomeSnapshot(data,+now+8*GAME_HOME_DAY),false);assert.equal(validGameHomeSnapshot({...data,featured:{games:[data.games[0]]}},+now),false);
 assert.equal(readGameHomeSnapshot({getItem(){throw Error();}},+now),null);assert.doesNotThrow(()=>storeGameHomeSnapshot({setItem(){throw Error();}},data));
 const controller=new AbortController();assert.equal(await fetchGameHome({now:+now,signal:controller.signal,fetcher:async(url,options)=>{assert.equal(url,'/api/game-highlights?v=6');assert.equal(options.signal,controller.signal);return {ok:true,json:async()=>data};}}),data);
 assert.equal(gameHomeNextRefresh({refreshAt:+now-1},+now),+now+300000);assert.equal(gameHomeNextRefresh({refreshAt:+now+60000},+now),+now+60000);
});
test('API keeps browsers revalidating, caches daily editions at CDN and enables last-good CDN failover',async()=>{
 const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(data){this.data=data;return this;}});
 let calls=0;const handler=createGameHighlightsHandler(async()=>{calls++;return {refreshAt:Date.now()+GAME_HOME_DAY,partial:false};});const res=response();await handler({method:'GET'},res);assert.equal(res.code,200);assert.match(res.headers['Cache-Control'],/max-age=0/);assert.match(res.headers['Cache-Control'],/s-maxage=86\d+/);assert.match(res.headers['Cache-Control'],/stale-if-error=604800/);
 await handler({method:'POST'},res);assert.equal(res.code,405);assert.equal(calls,1);
 const bad=response();await createGameHighlightsHandler(async()=>{throw Error('CONFIG');})({method:'GET'},bad);assert.equal(bad.code,503);assert.equal(bad.headers['Cache-Control'],'no-store');assert.equal(bad.data.code,'GAME_CATALOG_CONFIGURATION');assert.notEqual(bad.data.erro,'CONFIG');
});
