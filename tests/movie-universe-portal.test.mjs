import test from 'node:test';
import assert from 'node:assert/strict';
import { franchises } from '../franchises.config.js';
import { movieUniversePortal } from '../config/movie-universe-portal.js';
import { filterPortalRows, nextUniverseMovie, readUniverseQuery, universePortalRows, universeQuery, universeSummary } from '../lib/movie-universe-portal.js';
import { clearFranchiseCache, getFranchiseIndex } from '../lib/franchises.js';

const catalogue = [
  {slug:'a',nome:'Água',movieIds:[1,2,3,4],total:4},
  {slug:'b',nome:'Bosque',movieIds:[1,5],total:2},
  {slug:'c',nome:'Céu',movieIds:[6,7,8],total:3},
  {slug:'empty',nome:'Vazio',movieIds:[],total:0},
  {slug:'error',nome:'Falhou',error:true},
];
const reviews = {'filmes:1':{nota:0,public:false,data:'2026-10-20'},'filmes:5':{nota:4,data:'2026-10-29'},'filmes:2':{nota:'5'},'jogos:6':{nota:5}};

test('portal preserves valid private/zero reviews, ignores unrated records and deduplicates summary films', () => {
  const rows = universePortalRows(catalogue, reviews), summary = universeSummary(rows, reviews);
  assert.equal(rows[0].seen,1);assert.equal(rows[0].ratio,.25);
  assert.equal(rows[1].complete,true);assert.equal(rows[3].complete,false);
  assert.equal(summary.started,2);assert.equal(summary.seen,2);assert.equal(summary.latest.slug,'b');
  assert.equal(summary.featured.slug,'b');assert.equal(universeSummary(universePortalRows(catalogue,{}),{}).featured.slug,'a');
  assert.equal(universeSummary(universePortalRows([catalogue.at(-1)],{}),{}).featured,null);
  assert.deepEqual(catalogue[0].movieIds,[1,2,3,4]);
});
test('filters, accent-insensitive search and sorting combine without treating failed catalogues as unstarted', () => {
  const rows = universePortalRows(catalogue,reviews), select = patch => filterPortalRows(rows,{filter:'all',sort:'progress',search:'',...patch}).map(row => row.slug);
  assert.deepEqual(select({filter:'started'}),['a']);assert.deepEqual(select({filter:'complete'}),['b']);
  assert.deepEqual(select({filter:'new'}),['c','empty']);assert.deepEqual(select({search:' AGUA '}),['a']);
  assert.deepEqual(select({sort:'movies'}),['a','c','b','empty','error']);
  assert.deepEqual(select({sort:'name'}),['a','b','c','empty','error']);
  assert.deepEqual(select({filter:'started',search:'Céu'}),[]);
});
test('progress ordering uses film counts, while the featured universe follows the latest film watched', () => {
  const films = Array.from({length:40},(_,index)=>index+1), toy = [51,52,53,54,55];
  const watched = Object.fromEntries([...films.slice(0,12),...toy].map(id=>[`filmes:${id}`,{nota:4,data:id===55?'2026-10-29':'2026-10-20'}]));
  const rows = universePortalRows([{slug:'marvel',nome:'Marvel',total:40,movieIds:films},{slug:'toy',nome:'Toy Story',total:5,movieIds:toy}],watched);
  assert.equal(universeSummary(rows,watched).latest.slug,'toy');
  assert.equal(universeSummary(rows,watched).featured.slug,'toy');
  assert.deepEqual(filterPortalRows(rows,{filter:'all',sort:'progress',search:''}).map(row=>row.slug),['marvel','toy']);
  assert.equal(rows[0].ratio,.3);assert.equal(rows[1].ratio,1);assert.equal(rows[1].complete,true);
});
test('latest universe uses finish date, save time for same-day ties, private zero ratings and historical save-time fallback', () => {
  const movies=[{slug:'a',nome:'A',total:2,movieIds:[1,2]},{slug:'b',nome:'B',total:1,movieIds:[3]}];
  const records={'filmes:1':{nota:5,data:'2026-10-01',atualizadoEm:'2026-10-29T12:00:00Z'},'filmes:3':{nota:0,public:false,data:'2026-10-28',atualizadoEm:'2026-10-28T10:00:00Z'},'filmes:999':{nota:5,data:'2026-10-29'}};
  const summary=()=>universeSummary(universePortalRows(movies,records),records);
  assert.equal(summary().featured.slug,'b');
  records['filmes:2']={nota:4,data:'2026-10-28',atualizadoEm:'2026-10-28T11:00:00Z'};
  assert.equal(summary().featured.slug,'a');
  records['filmes:3']={nota:0,public:false,atualizadoEm:'2026-10-29T11:00:00Z'};
  assert.equal(summary().featured.slug,'b');
});
test('query state round-trips, rejects repeated/invalid values and resets only portal parameters', () => {
  const values = readUniverseQuery({filter:'started',sort:'movies',q:'Star Wars'});
  assert.deepEqual(readUniverseQuery(universeQuery({other:'keep'},values)),values);
  assert.deepEqual(readUniverseQuery({filter:['complete','new'],sort:'unknown',q:['a','b']}),{filter:'all',sort:'progress',search:''});
  assert.deepEqual(universeQuery({other:'keep',filter:'new',sort:'name',q:'old'},readUniverseQuery({})),{other:'keep'});
  assert.equal(readUniverseQuery({q:'a'.repeat(200)}).search.length,100);
});
test('continuation respects curated chronology, skips private/zero reviews and falls back to release order', () => {
  assert.equal(nextUniverseMovie(catalogue[0],reviews,[999,3,1,2]),3);
  assert.equal(nextUniverseMovie(catalogue[0],reviews),2);
  assert.equal(nextUniverseMovie(catalogue[1],reviews,[5,1]),null);
  assert.equal(nextUniverseMovie(catalogue[3],reviews),null);
  assert.equal(nextUniverseMovie(catalogue[0],reviews,[1]),2);
});
test('portal reuses every original logo and accent from the existing single configuration', () => {
  for (const row of franchises) {
    const config = movieUniversePortal[row.slug];
    assert.equal(config.logo,row.logo);assert.equal(config.accent,row.cor);
    assert.deepEqual(config.media,['filmes']);assert.deepEqual(config.chronology,row.ordem_cronologica || []);
  }
});
test('index previews reuse cached catalogue movies without individual poster requests', async t => {
  const originalFetch = globalThis.fetch, key = process.env.TMDB_API_KEY;
  process.env.TMDB_API_KEY='test';clearFranchiseCache();
  t.after(() => {globalThis.fetch=originalFetch;clearFranchiseCache();if(key===undefined)delete process.env.TMDB_API_KEY;else process.env.TMDB_API_KEY=key;});
  let calls=0;
  globalThis.fetch=async input => {calls++;const url=new URL(input);if(url.pathname==='/3/collection/2344')return {ok:true,json:async()=>({parts:[{id:1,title:'Matrix',poster_path:'/matrix.jpg',release_date:'1999-01-01'},{id:2,title:'Outro',release_date:'2000-01-01'}]})};throw Error('mock source unavailable');};
  const index = await getFranchiseIndex(), matrix = index.find(row=>row.slug==='matrix'), firstCalls=calls;
  assert.deepEqual(matrix.movieIds,[1,2]);assert.deepEqual(matrix.previews,[{id:1,titulo:'Matrix',poster:'https://image.tmdb.org/t/p/w185/matrix.jpg'}]);
  await getFranchiseIndex();assert.equal(calls-firstCalls,firstCalls-1); // Failed sources retry; the successful collection stays cached.
  assert.equal(matrix.total,2);assert.equal(matrix.movies,undefined);
});
