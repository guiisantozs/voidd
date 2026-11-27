import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicCatalogClient} from '../lib/public-catalog-client.js';
import {createResourceMetrics} from '../lib/resource-metrics.js';
import {createIGDBClient} from '../lib/igdb-client.js';
import {createGameCacheStorage} from '../lib/game-public-cache.js';
import {createSteamProvider} from '../lib/steam-collection-provider.js';
import {clearDetailCache,getMovieDetail,getMovieRelease} from '../lib/movie-detail.js';

const ok=data=>({ok:true,status:200,json:async()=>data});
test('detail and release eligibility for five films share five source calls, including requests in flight',async t=>{
 clearDetailCache();let calls=0;const previous=process.env.TMDB_API_KEY;process.env.TMDB_API_KEY='fixture-only';
 t.after(()=>{clearDetailCache();if(previous===undefined)delete process.env.TMDB_API_KEY;else process.env.TMDB_API_KEY=previous;});
 t.mock.method(globalThis,'fetch',async url=>{calls++;return ok({id:Number(new URL(url).pathname.split('/').at(-1)),release_date:'2020-01-01',status:'Released',videos:{results:[{site:'YouTube',key:'abcdefghijk',type:'Trailer'}]}});});
 for(let id=1;id<=5;id++){
  const [detail,release]=await Promise.all([getMovieDetail(String(id)),getMovieRelease(String(id))]);
  assert.equal(detail.estreia,release.estreia);assert.equal(release.releaseStatus,'Released');
  assert.equal((await getMovieRelease(String(id))).id,id);
 }
 assert.equal(calls,5);
});
test('same public search and filters share concurrent work and navigation cache; expired entries refetch',async()=>{
 let calls=0,now=0;const metrics=createResourceMetrics(),client=createPublicCatalogClient({clock:()=>now,metrics,fetcher:async()=>{calls++;return ok({movies:[{id:1}]});}});
 const rows=await Promise.all(Array.from({length:50},()=>client.request('/api/series/search?q=Dark')));
 assert.equal(calls,1);rows[0].movies[0].id=99;assert.equal(rows[1].movies[0].id,1);
 const again=await client.request('/api/series/search?cursor=1%3A0&year=&genre=all&q=Dark');assert.equal(again.movies[0].id,1);assert.equal(calls,1);
 await client.request('/api/series/search?q=Dark&year=2020');assert.equal(calls,2);
 now=300001;await client.request('/api/series/search?q=Dark');assert.equal(calls,3);
 assert.equal(metrics.snapshot().rows['/api/series/search'].deduplicated,49);
 assert(!JSON.stringify(metrics.snapshot()).includes('Dark'));
});
test('canceling one subscriber preserves others, and canceling every subscriber aborts the network',async()=>{
 let finish,networkSignal;
 const client=createPublicCatalogClient({fetcher:async(_,options)=>{networkSignal=options.signal;return new Promise(resolve=>{finish=()=>resolve(ok({movies:[]}));});}});
 const a=new AbortController(),b=new AbortController();
 const first=client.request('/api/movie-search?q=Alien',{signal:a.signal}),second=client.request('/api/movie-search?q=Alien',{signal:b.signal});
 await Promise.resolve();a.abort();await assert.rejects(first,{name:'AbortError'});assert.equal(networkSignal.aborted,false);finish();await second;
 const c=new AbortController(),third=client.request('/api/movie-search?q=Other',{signal:c.signal});await Promise.resolve();c.abort();await assert.rejects(third,{name:'AbortError'});await Promise.resolve();assert.equal(networkSignal.aborted,true);finish();
});
test('public cache rejects private routes, failures are retryable, partial data is not retained and memory is bounded',async()=>{
 let calls=0;const client=createPublicCatalogClient({limit:1,fetcher:async()=>{calls++;return calls===1?{ok:false,status:429,json:async()=>({erro:'Aguarde'})}:ok({movies:[],partial:calls===2});}});
 for(const path of ['/api/series/preferences','/api/series/personalized','/api/game-collection','https://example.com/api/series','/api/series/../series/preferences'])assert.throws(()=>client.request(path),/PUBLIC_CATALOG/);
 await assert.rejects(client.request('/api/series/search?q=Lost'),/Aguarde/);
 await client.request('/api/series/search?q=Lost');await client.request('/api/series/search?q=Lost');assert.equal(calls,3);
 await client.request('/api/series/search?q=Dark');await client.request('/api/series/search?q=Lost');assert.equal(calls,5);
 const aborted=new AbortController();aborted.abort();await assert.rejects(client.request('/api/series',{signal:aborted.signal}),{name:'AbortError'});assert.equal(calls,5);
});
test('IGDB transport deduplicates identical POST queries and blocks queued/new calls after 429 until Retry-After',async()=>{
 let now=1000,calls=0;const metrics=createResourceMetrics();
 const request=createIGDBClient({clock:()=>now,metrics,interval:0,credentials:()=>({id:'test',secret:'test'}),fetcher:async url=>{
  if(url.includes('oauth2'))return ok({access_token:'test-token',expires_in:1000});
  calls++;return calls===1?{ok:false,status:429,headers:new Headers({'Retry-After':'120'})}:ok([]);
 }});
 const results=await Promise.allSettled([...Array.from({length:10},()=>request('games','fields name;')),request('games','fields slug;')]);
 assert(results.every(r=>r.status==='rejected'&&r.reason.status===429));assert.equal(calls,1);
 await assert.rejects(request('games','fields cover;'),{status:429});assert.equal(calls,1);
 now+=120001;await request('games','fields name;');assert.equal(calls,2);
 assert.equal(metrics.snapshot().rows['IGDB:games'].deduplicated,9);
});
test('20 cache writes perform one cleanup per hour per instance, including concurrent writes',async()=>{
 let now=1000,writes=0,deletes=0;
 const db={from(){return {upsert:async()=>{writes++;return {};},delete(){deletes++;return {lt:async()=>({})};}};}};
 const store=createGameCacheStorage({getDatabase:()=>db,clock:()=>now});
 await Promise.all(Array.from({length:20},(_,i)=>store.write(String(i),{public:true},100)));
 assert.equal(writes,20);assert.equal(deletes,1);now+=3600000;await store.write('next',{},100);assert.equal(deletes,2);
});
test('Steam imports with a configured legacy key do not contact RAWG in default IGDB mode',async t=>{
 const previous={provider:process.env.GAME_CATALOG_PROVIDER,key:process.env.RAWG_API_KEY};
 delete process.env.GAME_CATALOG_PROVIDER;process.env.RAWG_API_KEY='test-unused';
 t.after(()=>{for(const [key,value] of [['GAME_CATALOG_PROVIDER',previous.provider],['RAWG_API_KEY',previous.key]])if(value===undefined)delete process.env[key];else process.env[key]=value;});
 const urls=[];const provider=createSteamProvider({key:'test',fetcher:async url=>{urls.push(String(url));return ok({});}});
 await provider.enrich({appid:'987654321',title:'Fixture',minutes:1},'76561198000000000');
 assert.equal(urls.length,4);assert(urls.every(url=>!url.includes('rawg.io')));
});
