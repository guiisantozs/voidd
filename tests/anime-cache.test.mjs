import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnimeCache} from '../lib/anime-cache.js';
import {ANIME_TTL} from '../lib/anime-cache.js';
import {createAnimeClient,animeResourceTtl} from '../lib/anime-catalog.js';
test('persistent anime cache deduplicates cold reads, serves stale immediately, refreshes once and preserves data on failure',async()=>{
 let now=0,loads=0,reads=0,resolve;const rows=new Map(),background=[];
 const store={read:async key=>{reads++;return rows.get(key)||null;},claim:async()=>true,release:async()=>{},write:async(key,payload,ttl)=>rows.set(key,{payload,expires_at:new Date(now+ttl).toISOString()}),catalog:async()=>[]};
 const cache=createAnimeCache({store,clock:()=>now,background:p=>background.push(p)});
 const load=async()=>{loads++;return {id:1,text:'Salvo'};};
 const [a,b]=await Promise.all([cache.get('detail:v1:1',load,{ttl:100}),cache.get('detail:v1:1',load,{ttl:100})]);assert.deepEqual(a,b);assert.equal(loads,1);assert.equal(reads,1);
 now=101;const deferred=()=>{loads++;return new Promise(r=>{resolve=r;});};assert.equal((await cache.get('detail:v1:1',deferred)).text,'Salvo');await cache.get('detail:v1:1',deferred);assert.equal(loads,2);resolve({id:1,text:'Novo'});await Promise.all(background);assert.equal((await cache.get('detail:v1:1',load)).text,'Novo');
 now+=3000000000;assert.equal((await cache.get('detail:v1:1',async()=>{throw Error('offline');})).text,'Novo');await Promise.all(background);assert.equal((await cache.get('detail:v1:1',load)).text,'Novo');
 const other=createAnimeCache({store,clock:()=>now});assert.equal((await other.peek('detail:v1:1')).text,'Novo');
});
test('a derived SWR refresh waits for its expired source, deduplicates it and does not renew old data on source failure',async()=>{
 let now=0,loads=0,release,fail=false;const rows=new Map(),background=[];
 const store={read:async key=>rows.get(key)||null,claim:async()=>true,release:async()=>{},write:async(key,payload,ttl)=>rows.set(key,{payload,expires_at:new Date(now+ttl).toISOString()}),catalog:async()=>[]};
 const cache=createAnimeCache({store,clock:()=>now,background:p=>background.push(p)}),source=()=>cache.get('source',async()=>{loads++;if(fail)throw Error('offline');if(loads===1)return {version:1};return new Promise(resolve=>{release=resolve;});},{ttl:100}),detail=()=>cache.get('detail',async()=>({version:(await source()).version}),{ttl:100});
 assert.equal((await detail()).version,1);now=101;
 assert.equal((await detail()).version,1);assert.equal((await detail()).version,1);
 // Drain the asynchronous lease/load boundaries without releasing the source.
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(loads,2);assert.equal(rows.get('detail').expires_at,new Date(100).toISOString());
 assert.equal(await cache.peek('source',{fresh:true}),null);
 release({version:2});await Promise.all(background);
 assert.equal((await detail()).version,2);assert.equal(rows.get('detail').expires_at,new Date(201).toISOString());
 now=202;fail=true;assert.equal((await detail()).version,2);await Promise.all(background);
 assert.equal(rows.get('detail').expires_at,new Date(201).toISOString());
 assert.equal((await detail()).version,2);assert.equal(loads,3);
 assert.equal((await cache.peek('detail')).version,2);assert.equal(await cache.peek('detail',{fresh:true}),null);
});
test('a dependent refresh waits for a fresh shared lease result beyond twelve seconds and ignores expired polling rows',async()=>{
 let now=100,sourceLoads=0;const background=[],rows=new Map([['source',{payload:{version:1},expires_at:new Date(0).toISOString()}],['detail',{payload:{version:1},expires_at:new Date(0).toISOString()}]]);
 const store={read:async key=>rows.get(key)||null,claim:async key=>key!=='source',release:async()=>{},write:async(key,payload,ttl)=>rows.set(key,{payload,expires_at:new Date(now+ttl).toISOString()}),catalog:async()=>[]};
 const cache=createAnimeCache({store,clock:()=>now,background:p=>background.push(p),sleep:async ms=>{now+=ms;if(now>20000)rows.set('source',{payload:{version:2},expires_at:new Date(now+1000).toISOString()});}});
 const detail=()=>cache.get('detail',async()=>({version:(await cache.get('source',async()=>{sourceLoads++;return {version:3};},{ttl:1000})).version}),{ttl:1000});
 assert.equal((await detail()).version,1);await Promise.all(background);
 assert.ok(now>20000);assert.equal((await detail()).version,2);assert.equal(sourceLoads,0);
});
test('a persistent resource refresh bypasses the in-process response cache while retaining simultaneous-request deduplication',async()=>{
 let calls=0;const client=createAnimeClient({protocol:'jikan',spacing:0,fetcher:async()=>({ok:true,json:async()=>({data:{mal_id:1,status:'Finished Airing',version:++calls}})})});
 assert.equal((await client.resource('anime/1/full',{},ANIME_TTL.static)).data.version,1);
 assert.equal((await client.resource('anime/1/full',{},ANIME_TTL.static)).data.version,1);
 const [a,b]=await Promise.all([client.resource('anime/1/full',{},ANIME_TTL.static,{fresh:true}),client.resource('anime/1/full',{},ANIME_TTL.static,{fresh:true})]);
 assert.equal(a.data.version,2);assert.equal(b.data.version,2);assert.equal(calls,2);
});
test('airing full details expire in twelve hours in both resource tiers; static completed details retain thirty days',async()=>{
 let now=0,calls=0;const client=createAnimeClient({protocol:'jikan',clock:()=>now,spacing:0,fetcher:async url=>{calls++;return {ok:true,json:async()=>({data:{mal_id:url.includes('anime/1/')?1:2,status:url.includes('anime/1/')?'Currently Airing':'Finished Airing'}})};}});
 assert.equal(animeResourceTtl('anime/1/full',{data:{status:'Currently Airing'}},ANIME_TTL.static),ANIME_TTL.airing);
 assert.equal(animeResourceTtl('anime/2/full',{data:{status:'Finished Airing'}},ANIME_TTL.static),ANIME_TTL.static);
 assert.equal(animeResourceTtl('anime/1/full',{data:{status:'Currently Airing'}},1000),1000);
 await client.resource('anime/1/full',{},ANIME_TTL.static);await client.resource('anime/2/full',{},ANIME_TTL.static);assert.equal(calls,2);
 now=ANIME_TTL.airing+1;await client.resource('anime/1/full',{},ANIME_TTL.static);await client.resource('anime/2/full',{},ANIME_TTL.static);assert.equal(calls,3);
});
