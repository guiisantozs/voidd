// Controlled audit: fixtures only, no environment files or real provider calls.
// Baseline source is materialized under ignored tmp/; no checkout is modified.
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createPublicCatalogClient} from '../lib/public-catalog-client.js';
import {createGameCacheStorage} from '../lib/game-public-cache.js';
import {createResourceMetrics} from '../lib/resource-metrics.js';

const revision=process.argv[2]||'d05d444';
// Resolve a commit first; never treat an arbitrary CLI argument as a git option.
const commit=execFileSync('git',['rev-parse','--verify',revision+'^{commit}'],{encoding:'utf8'}).trim();
const root=resolve('tmp/resource-audit/baseline-'+commit.slice(0,8));mkdirSync(root,{recursive:true});
const files=execFileSync('git',['ls-tree','-r','--name-only',commit],{encoding:'utf8'}).trim().split('\n').filter(file=>file.endsWith('.js')&&(file.startsWith('lib/')||file.startsWith('config/')||!file.includes('/')));
for(const file of files){const out=resolve(root,file);mkdirSync(dirname(out),{recursive:true});writeFileSync(out,execFileSync('git',['show',commit+':'+file]));}
const load=(base,file)=>import(pathToFileURL(resolve(base,file)).href);
const before=await load(root,'lib/series-catalog.js'),after=await load('.','lib/series-catalog.js');
process.env.TMDB_API_KEY='audit-fixture-only';
const raw=id=>({id,name:'Fixture '+id,title:'Fixture '+id,poster_path:'/fixture.jpg',backdrop_path:'/fixture.jpg',origin_country:['US'],original_language:'en',genre_ids:[18],first_air_date:'2020-01-01',vote_average:8.6,vote_count:5000,popularity:100,keywords:{results:[]},seasons:[{season_number:2,episode_count:10,air_date:'2026-10-01'}]});
async function series(catalog,sections){
 catalog.clearSeriesCache();let calls=0;
 const fetcher=async url=>{calls++;return /\/tv\/\d+$/.test(url.pathname)?raw(Number(url.pathname.split('/').at(-1))):{results:Array.from({length:20},(_,i)=>raw(i+(/discover/.test(url.pathname)?101:1))),total_pages:1};};
 await Promise.all(sections.map(section=>catalog.getSeriesSection(section,1,{fetcher,today:'2026-11-03'})));
 return calls;
}
const report={baseline:commit,scope:'Synthetic fixtures; not production traffic, billing, images or authenticated Supabase flows',scenarios:[]};
const add=(flow,unit,before,after,note='')=>report.scenarios.push({flow,unit,before,after,reductionPercent:Math.round((before-after)/before*10000)/100,note});
add('Series initial catalogue, before offscreen intersection','TMDB requests',await series(before,['hero','trending','new-seasons','acclaimed','essentials']),await series(after,['hero']),'20 trend candidates, 20 distinct season candidates, 16 essentials. Deferred work occurs when sections approach viewport.');
add('Unused series catalogue on home page','TMDB requests',await series(before,['trending']),0,'HomeHero ignores catalogue props and HomeCatalog renders films/games only. Series navigation remains a link.');
const detailCounts=[];
for(const base of [root,'.']){
 const catalog=await load(base,'lib/movie-detail.js');catalog.clearDetailCache();let calls=0;
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async url=>{calls++;return {ok:true,json:async()=>({id:Number(new URL(url).pathname.split('/').at(-1)),release_date:'2020-01-01',status:'Released',videos:{results:[{site:'YouTube',key:'abcdefghijk',type:'Trailer'}]}})};};
  for(let id=1;id<=5;id++)await Promise.all([catalog.getMovieDetail(String(id)),catalog.getMovieRelease(String(id))]);
  detailCounts.push(calls);
 }finally{globalThis.fetch=original;catalog.clearDetailCache();}
}
add('Open five movies and check review release eligibility','TMDB requests',...detailCounts,'Valid trailer included in fixture; optional fallback trailer request is not needed.');
const gameCounts=[];
for(const base of [root,'.']){
 const {createIGDBCatalog}=await load(base,'lib/igdb-catalog.js'),{createPublicGameCache}=await load(base,'lib/game-public-cache.js');
 const {loadGameHome,createGameHomeCache}=await load(base,'lib/game-home.js'),{loadCuratedTrending}=await load(base,'lib/game-curated-trending.js');
 const {default:entries}=await load(base,'game-trending.config.js');
 let calls=0;
 const source=createIGDBCatalog({cache:createPublicGameCache({read:async()=>null,write:async()=>{}}),request:async(endpoint,body)=>{
  calls++;
  if(endpoint==='external_game_sources')return [{id:1,name:'Steam'}];
  if(endpoint==='external_games')return [];
  const title=body.match(/^search ("(?:\\.|[^"\\])*")/),id=Number(body.match(/where id=(\d+)/)?.[1]||700000+calls*50);
  const row=(id,name)=>({id,name,slug:'fixture-'+id,first_release_date:Date.parse('2026-10-01')/1000,total_rating:85,total_rating_count:500,cover:{image_id:'fixture'},artworks:[{image_id:'fixture',width:1920,height:1080}],involved_companies:entries.map(entry=>({developer:true,company:{name:entry.igdbCompany||'Fixture'}}))});
  return title?[row(id,JSON.parse(title[1]))]:body.includes('where id=')?[row(id,'Fixture '+id)]:Array.from({length:40},(_,i)=>row(id+i,'Fixture '+(id+i)));
 }});
 const now=()=>Date.parse('2026-11-03T12:00:00Z');
 const home=createGameHomeCache({clock:now,load:options=>loadGameHome({...options,loadRawg:opts=>source.highlights(opts),loadTrending:opts=>loadCuratedTrending({...opts,interval:0,loadWork:(_,id)=>source.detail(id),loadStores:async id=>(await source.detail(id)).stores,findCover:async()=>null})})});
 await home();const cold=calls;await Promise.all(Array.from({length:50},()=>home()));gameCounts.push({cold,additionalWarm:calls-cold});
}
add('Games home, cold public cache','IGDB queries',gameCounts[0].cold,gameCounts[1].cold,'Fixture exercises home, curated titles, crosswalk and store reuse; OAuth and images excluded.');
report.gamesWarm=gameCounts;
for(const [name,base] of [['before',root],['after','.']]){
 const {createIGDBClient}=await load(base,'lib/igdb-client.js');let calls=0;
 const request=createIGDBClient({interval:0,credentials:()=>({id:'fixture',secret:'fixture'}),fetcher:async url=>url.includes('oauth2')?{ok:true,json:async()=>({access_token:'fixture',expires_in:1000})}:(calls++,{ok:true,json:async()=>[]})});
 await Promise.all(Array.from({length:50},()=>request('games','fields name; where id=1;')));
 report[name+'ConcurrentIGDB']=calls;
 let limited=0;
 const fail=createIGDBClient({interval:0,credentials:()=>({id:'fixture',secret:'fixture'}),fetcher:async url=>url.includes('oauth2')?{ok:true,json:async()=>({access_token:'fixture',expires_in:1000})}:(limited++,{ok:false,status:429,headers:new Headers({'Retry-After':'60'})})});
 await Promise.allSettled(Array.from({length:5},(_,i)=>fail('games',`fields name; where id=${i+1};`)));
 report[name+'LimitedIGDB']=limited;
}
add('50 identical concurrent transport requests','IGDB requests',report.beforeConcurrentIGDB,report.afterConcurrentIGDB,'Transport stress scenario, one instance. Existing public cache already deduplicates many catalogue paths.');
add('Five distinct queued queries after first 429','IGDB requests',report.beforeLimitedIGDB,report.afterLimitedIGDB);
let network=0;const client=createPublicCatalogClient({metrics:createResourceMetrics(),fetcher:async()=>{network++;return {ok:true,json:async()=>({movies:[{id:1}]})};}});
for(const q of ['Alien','Dark','Alien','Dark'])await client.request('/api/movie-search?'+new URLSearchParams({q}));
add('Search Alien, Dark, Alien, Dark within TTL','browser API requests',4,network,'Before: four fetch calls in MovieSearch; after: exercised actual public client. Server caches may already avoid upstream work.');
let writes=0,cleanups=0;const storage=createGameCacheStorage({getDatabase:()=>({from:()=>({upsert:async()=>{writes++;return {};},delete:()=>{cleanups++;return {lt:async()=>({})};}})})});
await Promise.all(Array.from({length:20},(_,i)=>storage.write(String(i),{},1000)));
add('20 public catalogue cache writes in one hour','Supabase operations',40,writes+cleanups,'Before: upsert + delete per write, verified in baseline source. After: actual storage with mocked database.');
const initialMovies=readFileSync(resolve(root,'lib/movie-sections.js'),'utf8').match(/export const movieSectionKeys = \[([^;]+);/)[1];
add('Movies initial catalogue, before offscreen intersection','browser API requests',(initialMovies.match(/'[^']+'/g)||[]).length+5,1,'Nine initial sections in baseline; only hero is eager after. Lazy sections may intersect on tall screens.');
const output=resolve('docs/RESOURCE_AUDIT_RESULTS.json');writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
