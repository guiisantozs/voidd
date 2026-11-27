// Fixtures only: no env files, real APIs or remote database operations.
import {writeFileSync} from 'node:fs';
import {createPublicCatalogClient} from '../lib/public-catalog-client.js';
import {createPublicGameCache} from '../lib/game-public-cache.js';
import {searchMovies,searchMoviePage,clearMovieSearchCache} from '../lib/movie-search.js';
import {createResourceMetrics} from '../lib/resource-metrics.js';
const ok=data=>({ok:true,status:200,json:async()=>data});
const rows=[];
const add=(flow,unit,before,after,note)=>rows.push({flow,unit,before,after,reductionPercent:Math.round((before-after)/before*10000)/100,note});
let calls=0;
const fetcher=async()=>{calls++;return ok({items:[{id:1}],pagination:{page:1,hasNext:false}});};
const path='/api/profile-media-search?media=filmes&q=Alien&page=1';
await Promise.all(Array.from({length:5},()=>fetcher(path)));const separate=calls;calls=0;
const shared=createPublicCatalogClient({fetcher,storage:()=>null,metrics:createResourceMetrics()});
await Promise.all(Array.from({length:5},()=>shared.request(path)));
add('Five work selectors asking for the same page','browser API requests',separate,calls,'Before selectors used independent fetch calls; after exercises the shared public client. Server deduplication may already avoid upstream calls.');
const data=new Map(),storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
calls=0;
for(let i=0;i<5;i++)await createPublicCatalogClient({fetcher,storage:()=>null,metrics:createResourceMetrics()}).request(path);
const withoutStorage=calls;calls=0;
for(let i=0;i<5;i++)await createPublicCatalogClient({fetcher,storage:()=>storage,metrics:createResourceMetrics()}).request(path);
add('Five visits/reloads within the same tab and cache validity','browser API requests',withoutStorage,calls,'New client instance per visit; sessionStorage reused, no private endpoints.');
let reads=0,writes=0;
for(const persist of [true,false]){
 const cache=createPublicGameCache({read:async()=>{reads++;return null;},write:async()=>{writes++;}});
 for(let i=0;i<20;i++)await cache('text:'+i,async()=>[],{ttl:300000,stale:0,persist});
 if(persist){rows.push({flow:'Twenty distinct game text searches: persistent-cache overhead',unit:'Supabase reads + writes',before:reads+writes});reads=0;writes=0;}
 else{const row=rows.at(-1);row.after=reads+writes;row.reductionPercent=100;row.note='Catalogue query cache only; identity crosswalk setup, actual IGDB calls and old stored rows excluded. Filter-only catalogue and stable metadata keep existing persistence.';}
}
const original=globalThis.fetch;process.env.TMDB_API_KEY='audit-fixture-only';calls=0;
try{
 globalThis.fetch=async()=>{calls++;return ok({total_pages:100,results:[{id:1,adult:true}]});};
 const options={q:'Fixture',genre:'all',year:'',page:1,offset:0};
 clearMovieSearchCache();await searchMovies(options);const previous=calls;calls=0;clearMovieSearchCache();await searchMoviePage(options);
 add('Sparse film selector stops after one source page','TMDB requests',previous,calls,'Before profile selector used searchMovies with up to three automatic pages. New selector keeps manual next page even when filtered results are empty.');
}finally{globalThis.fetch=original;clearMovieSearchCache();}
const result={baseline:'39c094c selector behavior',scope:'Controlled fixtures, not production usage or billing',scenarios:rows};
writeFileSync('docs/SEARCH_CACHE_RESULTS.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
