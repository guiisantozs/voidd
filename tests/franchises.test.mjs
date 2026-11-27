import test from 'node:test';import assert from 'node:assert/strict';
import {franchises} from '../franchises.config.js';
import {clearFranchiseCache,FRANCHISE_TTL,getFranchise,getFranchiseIndex,mergeFranchiseMovies,movieUniverses} from '../lib/franchises.js';
import {filterUniverseMovies,franchiseProgress,isReviewed,orderFranchiseMovies,weightedVoidRating} from '../lib/franchise-model.js';
import handler from '../pages/api/universos/[slug].js';
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
function setup(t){const fetch=globalThis.fetch,key=process.env.TMDB_API_KEY;process.env.TMDB_API_KEY='test';clearFranchiseCache();t.after(()=>{globalThis.fetch=fetch;clearFranchiseCache();if(key===undefined)delete process.env.TMDB_API_KEY;else process.env.TMDB_API_KEY=key;});}
const movie=(id,extra={})=>({id,title:`Filme ${id}`,genre_ids:[28],vote_average:8,vote_count:20,release_date:'2000-01-01',...extra});
test('franchise configuration has distinct safe slugs and valid source IDs',()=>{
  assert.ok(franchises.length>0);assert.equal(new Set(franchises.map(f=>f.slug)).size,franchises.length);
  for(const f of franchises){assert.match(f.slug,/^[a-z0-9-]+$/);assert.match(f.cor,/^#[a-f0-9]{6}$/i);assert.ok(Object.values(f.fontes).flat().every(Number.isInteger));}
});
test('source union deduplicates, excludes adult/extra movies and gives explicit exclusion precedence',()=>{
  const rows=mergeFranchiseMovies({incluir:[3,4],excluir:[4],excluir_generos:[99]},[[movie(1),movie(2,{genre_ids:undefined,genres:[{id:99}]}),movie(3,{genre_ids:[99]})],[movie(1),movie(4),movie(5,{adult:true})]]);
  assert.deepEqual(rows.map(m=>m.id),[1,3]);assert.equal(rows[0].nota,4);
});
test('chronology keeps unplaced films at the end and filters preserve original order numbers',()=>{
  const movies=[{id:1,estreia:'2000-01-01',ano:'2000',nota:4},{id:2,estreia:'2010-01-01',ano:'2010',nota:5},{id:3,estreia:null,ano:'',nota:null}];
  const ordered=orderFranchiseMovies(movies,[2,1],'chronological');assert.deepEqual(ordered.map(m=>m.id),[2,1,3]);
  const reviews={'filmes:1':{nota:4},'jogos:2':{nota:5}};
  assert.equal(franchiseProgress([1,2,3],reviews),1);assert.equal(isReviewed({'filmes:1':{nota:'4'}},1),false);
  assert.deepEqual(filterUniverseMovies(ordered,reviews,'seen').map(m=>[m.id,m.universeOrder]),[[1,2]]);
  assert.deepEqual(filterUniverseMovies(ordered,reviews,'unseen','rating').map(m=>m.id),[2,3]);assert.deepEqual(movies.map(m=>m.id),[1,2,3]);
});
test('Void average weights public ratings by actual review count and keeps empty as null',()=>{
  assert.equal(weightedVoidRating([]),null);assert.equal(weightedVoidRating([{average:4,total:10},{average:5,total:1}]),45/11);
});
test('one collection fetch serves concurrent franchise requests and expires after 24h',async t=>{
  setup(t);let calls=0;globalThis.fetch=async input=>{calls++;const url=new URL(input);assert.equal(url.pathname,'/3/collection/2344');assert.equal(url.searchParams.get('language'),'pt-BR');return {ok:true,json:async()=>({parts:[movie(1)]})};};
  const [a,b]=await Promise.all([getFranchise('matrix',0),getFranchise('matrix',0)]);assert.equal(calls,1);assert.equal(a,b);
  await getFranchise('matrix',FRANCHISE_TTL-1);assert.equal(calls,1);await getFranchise('matrix',FRANCHISE_TTL);assert.equal(calls,2);
});
test('keyword sources paginate in bulk, deduplicate and never fetch each film',async t=>{
  setup(t);let calls=0;
  globalThis.fetch=async input=>{calls++;const url=new URL(input);assert.equal(url.pathname,'/3/discover/movie');assert.equal(url.searchParams.get('with_keywords'),'180547');
    return {ok:true,json:async()=>({total_pages:2,results:url.searchParams.get('page')==='2'?[movie(2),movie(3,{genre_ids:[99]})]:[movie(1),movie(2)]})};};
  const result=await getFranchise('marvel-mcu');assert.deepEqual(result.movies.map(m=>m.id),[1,2]);assert.equal(calls,2);assert.ok(!JSON.stringify(result).includes('api_key'));
});
test('source failures stay isolated; membership reuses cached collections and reports partial state',async t=>{
  setup(t);globalThis.fetch=async input=>{const url=new URL(input);if(url.pathname.endsWith('/collection/2344'))return {ok:true,json:async()=>({parts:[movie(99)]})};throw Error('provider failure with private URL');};
  const index=await getFranchiseIndex();assert.equal(index.find(f=>f.slug==='matrix').total,1);assert.ok(index.find(f=>f.slug==='dc').error);
  const membership=await movieUniverses(99);assert.equal(membership.partial,true);assert.equal(membership.universes[0].slug,'matrix');
});
test('franchise routes reject unknown slugs/methods without provider requests and hide errors',async t=>{
  setup(t);let calls=0;globalThis.fetch=async()=>{calls++;throw Error('secret-url');};
  const invalid=response();await handler({method:'GET',query:{slug:'../secret'}},invalid);assert.equal(invalid.code,404);assert.equal(calls,0);
  const denied=response();await handler({method:'POST'},denied);assert.equal(denied.code,405);assert.equal(calls,0);
  const failed=response();await handler({method:'GET',query:{slug:'matrix'}},failed);assert.equal(failed.code,502);assert.ok(!JSON.stringify(failed.body).includes('secret-url'));assert.equal(failed.headers['Cache-Control'],undefined);
});

test('DC retains all eight Batman adaptations across continuities when collection/company metadata fails',async t=>{
 setup(t);const batman=[272,155,49026,268,364,414,415,414906],requests=[];
 globalThis.fetch=async input=>{
  const url=new URL(input);requests.push(url.pathname);
  if(url.pathname==='/3/collection/263')throw Error('collection temporarily unavailable');
  if(url.pathname.startsWith('/3/collection/'))return {ok:true,json:async()=>({parts:[movie(123,{poster_path:'/superman.jpg'})]})};
  if(url.pathname==='/3/discover/movie')return {ok:true,json:async()=>({total_pages:1,results:[movie(456)]})};
  const id=Number(url.pathname.split('/').at(-1));return {ok:true,json:async()=>movie(id,{poster_path:`/real-${id}.jpg`})};
 };
 const result=await getFranchise('dc');
 assert.ok(result.partial);for(const id of batman)assert.match(result.movies.find(m=>m.id===id).poster,new RegExp(`real-${id}\\.jpg$`));
 assert.ok(result.movies.some(m=>m.id===123));assert.ok(result.movies.some(m=>m.id===456));assert.equal(new Set(result.movies.map(m=>m.id)).size,result.movies.length);
 assert.equal(requests.filter(p=>/^\/3\/movie\//.test(p)).length,14);
});

test('DC animation source is paginated in bulk with genre/runtime constraints, preserving existing sources',async t=>{
 setup(t);const config=franchises.find(f=>f.slug==='dc'),requests=[];
 globalThis.fetch=async input=>{
  const url=new URL(input);requests.push(url);
  if(url.pathname.startsWith('/3/collection/'))return {ok:true,json:async()=>({parts:config.fontes.filmes.map(id=>movie(id))})};
  assert.equal(url.pathname,'/3/discover/movie');
  if(url.searchParams.get('with_companies')==='429'){
   assert.equal(url.searchParams.get('with_genres'),'16');assert.equal(url.searchParams.get('with_runtime.gte'),'60');
   return {ok:true,json:async()=>({total_pages:2,results:[movie(url.searchParams.get('page')==='2'?881:880,{genre_ids:[16,28]})]})};
  }
  return {ok:true,json:async()=>({total_pages:1,results:[]})};
 };
 const data=await getFranchise('dc');
 assert.equal(data.partial,false);assert.equal(requests.filter(url=>url.searchParams.get('with_companies')==='429').length,2);
 assert(data.movies.find(m=>m.id===880).genreIds.includes(16));assert(data.movies.some(m=>m.id===881));
 assert.equal(requests.filter(url=>/^\/3\/movie\//.test(url.pathname)).length,0);
 assert.equal(data.movies.find(m=>m.id===880).nota,4);
});
