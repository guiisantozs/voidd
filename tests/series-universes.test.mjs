import test from 'node:test';
import assert from 'node:assert/strict';
import {seriesUniverses,seriesUniverseBySlug} from '../config/series-universes.js';
import {getSeriesUniverse,getSeriesUniverseIndex,matchesSeriesIdentity} from '../lib/series-universes.js';
import {clearSeriesCache} from '../lib/series-catalog.js';
import {franchiseProgress,filterUniverseMovies,orderFranchiseMovies} from '../lib/franchise-model.js';
import {universePortalRows,universeSummary,nextUniverseMovie} from '../lib/movie-universe-portal.js';

// This test process uses only a fake provider credential and injected responses.
process.env.TMDB_API_KEY='fixture-series-universes';
const identities=new Map(seriesUniverses.flatMap(row=>row.entries));
const raw=id=>({id,original_name:identities.get(id),name:identities.get(id),poster_path:`/${id}.jpg`,backdrop_path:`/${id}-scene.jpg`,first_air_date:`${id===1399?2011:2022}-01-01`,vote_average:8.6,vote_count:10,genres:[{id:18}],origin_country:['US'],original_language:'en'});

test('the requested universes use distinct TV identities; Rings of Power is one series rather than one entry per season',()=>{
  assert.equal(seriesUniverses.length,4);
  assert.deepEqual(seriesUniverseBySlug('senhor-dos-aneis').entries,[[84773,'The Lord of the Rings: The Rings of Power']]);
  assert.equal(seriesUniverseBySlug('diarios-de-um-vampiro').entries.length,3);
  assert.equal(seriesUniverseBySlug('game-of-thrones').entries.length,3);
  assert.equal(new Set(seriesUniverses.map(row=>row.slug)).size,4);
  for(const row of seriesUniverses)assert.equal(new Set(row.entries.map(([id])=>id)).size,row.entries.length);
  assert.equal(matchesSeriesIdentity({...raw(1399),original_name:'A different show'},[1399,'Game of Thrones']),false);
});

test('catalogue hydration bounds concurrency, uses only TV details, normalizes real source ratings and reuses provider cache',async()=>{
  clearSeriesCache();const calls=[];let active=0,maximum=0;
  const fetcher=async url=>{active++;maximum=Math.max(maximum,active);calls.push(url.pathname);await new Promise(resolve=>setTimeout(resolve,2));active--;assert.match(url.pathname,/^\/3\/tv\/\d+$/);return raw(Number(url.pathname.split('/').at(-1)));};
  const rows=await getSeriesUniverseIndex({fetcher});
  assert.equal(rows.length,4);assert(rows.every(row=>!row.error&&!row.partial));assert(maximum<=3);
  assert.equal(calls.length,identities.size);
  const data=await getSeriesUniverse('game-of-thrones',{fetcher});
  assert.equal(calls.length,identities.size);assert.equal(data.movies.length,3);assert(data.movies.every(item=>item.categoria==='series'&&item.tmdbRating===8.6&&item.nota===4.3));
  assert.deepEqual(orderFranchiseMovies(data.movies,data.ordem_cronologica,'chronological').map(item=>item.id),[94997,224372,1399]);
});

test('failed or mismatched titles remain partial, retry failed sources, and never replace missing metadata with fabricated records',async()=>{
  clearSeriesCache();let fail=true;
  const fetcher=async url=>{const id=Number(url.pathname.split('/').at(-1));if(fail&&id===46896)throw Error('upstream');return raw(id);};
  const partial=await getSeriesUniverse('diarios-de-um-vampiro',{fetcher});
  assert.equal(partial.partial,true);assert.equal(partial.total,2);assert(!partial.movies.some(item=>item.id===46896));
  fail=false;assert.equal((await getSeriesUniverse('diarios-de-um-vampiro',{fetcher})).total,3);
  clearSeriesCache();await assert.rejects(getSeriesUniverse('senhor-dos-aneis',{fetcher:async()=>({...raw(84773),original_name:'Wrong title'})}),/SOURCE/);
  await assert.rejects(getSeriesUniverse('unknown',{fetcher:async()=>assert.fail('No network for unknown universes')}),/NOT_FOUND/);
  const failed=await getSeriesUniverseIndex({fetcher:async()=>{throw Error('offline');}});
  assert(failed.every(row=>row.error&&!row.movies&&!row.total));
});

test('progress, continuation and filters isolate TV from movie IDs, preserve private zero ratings and avoid completion for partial catalogues',()=>{
  const catalogue=[{slug:'westeros',nome:'Westeros',movieIds:[1399,94997],total:2}];
  const reviews={'filmes:1399':{nota:5},'series:94997':{nota:0,public:false,data:'2026-10-30'},'series:1399:1:1':{nota:5}};
  const rows=universePortalRows(catalogue,reviews,'series'),summary=universeSummary(rows,reviews,'series');
  assert.equal(rows[0].seen,1);assert.equal(rows[0].ratio,.5);assert.equal(summary.seen,1);assert.equal(summary.latest.slug,'westeros');
  assert.equal(franchiseProgress([1399,94997],reviews,'series'),1);
  assert.equal(nextUniverseMovie(rows[0],reviews,[94997,1399],'series'),1399);
  assert.equal(franchiseProgress([1399],reviews),1);
  assert.deepEqual(filterUniverseMovies([{id:1399},{id:94997}],reviews,'seen','order','series').map(item=>item.id),[94997]);
  assert.equal(universePortalRows([{...catalogue[0],partial:true,movieIds:[94997],total:1}],reviews,'series')[0].complete,false);
});
