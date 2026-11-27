process.env.ANIME_CATALOG_PROVIDER='jikan';
process.env.JIKAN_API_BASE_URL='https://fixture-jikan.invalid/v4';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicCatalogClient,PUBLIC_CATALOG_STORAGE} from '../lib/public-catalog-client.js';
import {createScopedSearchCache} from '../lib/scoped-search-cache.js';
import {SEARCH_CACHE_MS} from '../lib/catalog-cache-policy.js';
import {searchProfileMedia,clearProfileSearchCache,parseProfileSearch} from '../lib/profile-search.js';
import {clearAnimeCache} from '../lib/anime-catalog.js';
import {clearSeriesCache} from '../lib/series-catalog.js';
import {clearMovieSearchCache,searchMoviePage} from '../lib/movie-search.js';
import {createIGDBCatalog} from '../lib/igdb-catalog.js';
import handler from '../pages/api/profile-media-search.js';
import {createPublicGameCache} from '../lib/game-public-cache.js';
const ok=(data,headers)=>({ok:true,status:200,headers,json:async()=>data});
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};

test('public session cache survives reload, normalizes terms and partitions media/pages; expiry refetches',async()=>{
 const storage=memory();let now=1000,calls=0;
 const options={storage:()=>storage,clock:()=>now,fetcher:async()=>{calls++;return ok({items:[{id:calls}],pagination:{page:1,hasNext:true}});}};
 await createPublicCatalogClient(options).request('/api/profile-media-search?media=filmes&q=Alien++2');
 const reloaded=createPublicCatalogClient(options);
 assert.equal((await reloaded.request('/api/profile-media-search?q=ALIEN+2&media=filmes&page=1')).items[0].id,1);assert.equal(calls,1);
 await reloaded.request('/api/profile-media-search?q=Alien+2&media=filmes&page=2');
 await reloaded.request('/api/profile-media-search?q=Alien+2&media=series');assert.equal(calls,3);
 now+=SEARCH_CACHE_MS+1;
 await createPublicCatalogClient(options).request('/api/profile-media-search?q=Alien+2&media=filmes');assert.equal(calls,4);
 reloaded.clear();assert.equal(storage.getItem(PUBLIC_CATALOG_STORAGE),null);
});
test('session cache stays optional, bounded and excludes private/no-store responses and private routes',async()=>{
 const storage=memory();let calls=0;
 const options={storage:()=>storage,limit:2,maxBytes:2500,fetcher:async()=>{calls++;return ok({movies:[{id:calls}]});}};
 const client=createPublicCatalogClient(options);
 for(const q of ['Alien','Dark','Lost'])await client.request('/api/movie-search?q='+q);
 const saved=storage.getItem(PUBLIC_CATALOG_STORAGE);assert(saved.length*2<=2500);assert(JSON.parse(saved).rows.length<=2);
 assert.throws(()=>client.request('/api/series/preferences'),/PUBLIC_CATALOG/);
 for(const directive of ['private, max-age=60','no-store']){
  const privateOptions={...options,storage:()=>memory(),fetcher:async()=>{calls++;return ok({movies:[]},new Headers({'Cache-Control':directive}));}};
  const c=createPublicCatalogClient(privateOptions);const before=calls;await c.request('/api/series/search?q=Dark');await c.request('/api/series/search?q=Dark');assert.equal(calls-before,2);
 }
 const blocked=createPublicCatalogClient({...options,storage:()=>{throw Error('blocked');}});await blocked.request('/api/movie-search?q=Other');
 storage.setItem(PUBLIC_CATALOG_STORAGE,'invalid JSON');await createPublicCatalogClient(options).request('/api/movie-search?q=Other');
});
test('people lookup cache cannot reuse another account/context, expired data or late old-account results',()=>{
 let now=0;const cache=createScopedSearchCache({clock:()=>now});
 assert.equal(cache.get('account-a:list-1','ana'),null);cache.set('account-a:list-1','ana',[{id:'a'}]);
 const rows=cache.get('account-a:list-1','ana');rows[0].id='changed';assert.equal(cache.get('account-a:list-1','ana')[0].id,'a');
 assert.equal(cache.get('account-b:list-1','ana'),null);
 cache.set('account-a:list-1','ana',[{id:'late'}]);assert.equal(cache.get('account-b:list-1','ana'),null);
 cache.set('account-b:list-1','ana',[]);assert.deepEqual(cache.get('account-b:list-1','ana'),[]);
 assert.equal(cache.get('account-b:list-2','ana'),null);
 cache.set('account-b:list-2','ana',[{id:'b'}]);now=15000;assert.equal(cache.get('account-b:list-2','ana'),null);
 cache.set('account-b:list-2','ana',[{id:'b'}]);cache.clear();assert.equal(cache.get('account-b:list-2','ana'),null);
});
test('selector paging validates early and requests one Jikan page at a time, even for sparse anime matches',async t=>{
 clearProfileSearchCache();clearSeriesCache();clearAnimeCache();let calls=0;
 const previous=process.env.TMDB_API_KEY;process.env.TMDB_API_KEY='fixture';
 t.after(()=>{clearProfileSearchCache();clearSeriesCache();if(previous===undefined)delete process.env.TMDB_API_KEY;else process.env.TMDB_API_KEY=previous;});
 t.mock.method(globalThis,'fetch',async url=>{calls++;const page=Number(new URL(url).searchParams.get('page'));assert.equal(new URL(url).hostname,'fixture-jikan.invalid');return ok({pagination:{has_next_page:true},data:page===1?[]:[{mal_id:page,title:'Fixture',images:{jpg:{image_url:'https://fixture.invalid/poster.jpg'}}}]});});
 for(const query of [{media:'animes',q:'N'},{media:'series',page:['1']},{media:'filmes',page:'501'},{media:'jogos',page:'0'}])assert.throws(()=>parseProfileSearch(query),/INVALID/);
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
 await handler({method:'GET',query:{media:'animes',q:'N'}},res);assert.equal(res.code,400);assert.equal(calls,0);
 const first=await searchProfileMedia(parseProfileSearch({media:'animes',q:'Naruto'}));assert.equal(first.items.length,0);assert.equal(first.pagination.hasNext,true);assert.equal(calls,1);
 const second=await searchProfileMedia(parseProfileSearch({media:'animes',q:'Naruto',page:'2'}));assert.equal(second.items[0].id,9000000002);assert.equal(calls,2);
 await searchProfileMedia(parseProfileSearch({media:'animes',q:'Naruto'}));assert.equal(calls,2);
});
test('film selectors stop at one source page and concurrent identical selectors share the server cache',async t=>{
 clearMovieSearchCache();clearProfileSearchCache();let calls=0;
 const previous=process.env.TMDB_API_KEY;process.env.TMDB_API_KEY='fixture';
 t.after(()=>{clearMovieSearchCache();clearProfileSearchCache();if(previous===undefined)delete process.env.TMDB_API_KEY;else process.env.TMDB_API_KEY=previous;});
 t.mock.method(globalThis,'fetch',async()=>{calls++;return ok({total_pages:100,results:[{id:1,adult:true}]});});
 const page=await searchMoviePage({q:'Alien',genre:'all',year:'',page:1});assert.equal(page.movies.length,0);assert.equal(page.pagination.hasNext,true);assert.equal(calls,1);
 await Promise.all(Array.from({length:20},()=>searchProfileMedia({media:'filmes',q:'Alien'})));assert.equal(calls,1);
 await searchProfileMedia({media:'filmes',q:'Alien',page:2});assert.equal(calls,2);
});
test('IGDB text and filter searches use short cache without stale fallback and distinct persistence policies',async()=>{
 const policies=[];
 const catalog=createIGDBCatalog({cache:async(key,load,options)=>{if(key==='legacy-steam-crosswalk-v1')return [];policies.push(options);return load();},request:async endpoint=>endpoint==='multiquery'?[{name:'items',result:[]},{name:'total',count:0}]:[]});
 await catalog.search({q:'Portal',page:1});await catalog.search({q:'',page:1});
 assert(policies.every(options=>options.ttl===SEARCH_CACHE_MS&&options.stale===0));
 assert.equal(policies[0].persist,false);assert.notEqual(policies[1].persist,false);
});
test('text-search memory cache avoids database reads/writes and does not serve expired data on provider failure',async()=>{
 let reads=0,writes=0,calls=0,now=0;
 const cache=createPublicGameCache({clock:()=>now,read:async()=>{reads++;return null;},write:async()=>{writes++;}});
 const options={ttl:SEARCH_CACHE_MS,stale:0,persist:false};
 await Promise.all(Array.from({length:20},()=>cache('text:Portal',async()=>{calls++;return [];},options)));
 assert.equal(calls,1);assert.equal(reads,0);assert.equal(writes,0);
 now=SEARCH_CACHE_MS+1;
 await assert.rejects(cache('text:Portal',async()=>{throw Error('offline');},options),/offline/);
 assert.equal(reads,0);assert.equal(writes,0);
});
