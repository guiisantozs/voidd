import test from 'node:test';
import assert from 'node:assert/strict';
import {marvelUniverse} from '../config/marvel-universe.js';
import {marvelShelves,marvelSeriesShelves,marvelCombinedShelves,doomsdayCountdown,doomsdayProgress} from '../lib/marvel-universe.js';
import {filterUniverseMovies} from '../lib/franchise-model.js';

test('series shelves reuse loaded titles, separate older TV from the Multiverse and never include films',()=>{
  const series=(id,estreia)=>({...movie(id,estreia),categoria:'series'});
  const items=[series(61889,'2015-04-10'),series(85271,'2021-01-15'),series(114471,'2025-06-24'),series(999,'2027-01-01'),series(888,null),series(85271,'2021-01-15'),movie(92749,'2022-03-30')];
  const original=JSON.stringify(items),rows=marvelSeriesShelves(items,{today:'2026-11-03'});
  assert.deepEqual(Object.keys(rows),['recent','multiverse','all']);
  assert.deepEqual(rows.recent.map(item=>item.id),[114471,85271,61889,999,888]);
  assert.deepEqual(rows.multiverse.map(item=>item.id),[85271,114471]);
  assert.deepEqual(rows.all.map(item=>item.id),[61889,85271,114471,999,888]);
  assert.equal(JSON.stringify(items),original);
  const filtered=filterUniverseMovies(items,{'series:85271':{nota:0},'filmes:114471':{nota:4}},'seen','order','series');
  const seen=marvelSeriesShelves(filtered,{today:'2026-11-03'});
  for(const shelf of Object.values(seen))assert.deepEqual(shelf.map(item=>item.id),[85271]);
  assert.deepEqual(marvelSeriesShelves([]),{recent:[],multiverse:[],all:[]});
});

const movie=(id,estreia)=>({id,estreia,categoria:'filmes',titulo:String(id)});
test('combined shelves interleave films and TV by story or release while keeping both identities',()=>{
  const series=(id,date)=>({...movie(id,date),categoria:'series'});
  const films=[movie(1771,'2011-07-22'),movie(299534,'2019-04-24'),movie(566525,'2021-09-01'),movie(1003596,'2026-12-17'),movie(85271,'2020-01-01')];
  const tv=[series(85271,'2021-01-15'),series(84958,'2021-06-09'),series(88396,'2021-03-19'),series(999,'2022-01-01'),series(85271,'2021-01-15'),series(777,null)];
  const original=JSON.stringify([films,tv]),rows=marvelCombinedShelves(films,tv,{today:'2026-11-03'}),keys=list=>list.map(item=>`${item.categoria}:${item.id}`);
  assert.deepEqual(keys(rows.chronological),['filmes:1771','filmes:299534','series:84958','series:85271','filmes:566525','series:88396','filmes:85271','series:999']);
  assert.equal(rows.chronological.at(-1).chronologyKnown,false);
  assert.deepEqual(keys(rows.recent),['series:999','filmes:566525','series:84958','series:88396','series:85271','filmes:85271','filmes:299534','filmes:1771','filmes:1003596','series:777']);
  assert.deepEqual(keys(rows.multiverse),['series:85271','series:88396','series:84958','filmes:566525','filmes:1003596']);
  assert.equal(rows.all.length,10);
  assert.equal(JSON.stringify([films,tv]),original);
  const reviews={'series:85271':{nota:0},'filmes:1771':{nota:4},'filmes:566525':{nota:null}};
  const seen=marvelCombinedShelves(films,tv,{today:'2026-11-03',filter:'seen',reviews});
  assert.deepEqual(keys(seen.all),['filmes:1771','series:85271']);
  assert.deepEqual(keys(seen.multiverse),['series:85271']);
  const unseen=marvelCombinedShelves(films,tv,{today:'2026-11-03',filter:'unseen',reviews});
  assert.ok(keys(unseen.all).includes('filmes:85271'));
  assert.ok(!keys(unseen.all).includes('series:85271'));
  assert.deepEqual(marvelCombinedShelves(),{chronological:[],recent:[],all:[],multiverse:[]});
});
test('shelves separate saga membership from story chronology and preserve catalogue identities',()=>{
  const films=[movie(1726,'2008-04-30'),movie(1771,'2011-07-22'),movie(429617,'2019-06-28'),movie(497698,'2021-07-07'),movie(1003596,'2026-12-16'),movie(1003598,'2027-12-15'),movie(1293690,'2028-05-04'),movie(999,null)];
  const original=JSON.stringify(films),rows=marvelShelves(films,{today:'2026-10-28'});
  assert.deepEqual(rows.recent.map(m=>m.id),[497698,429617,1771,1726,1003596,1003598,1293690,999]);
  assert.deepEqual(rows.chronological.map(m=>m.id),[1771,1726,497698,429617]);
  assert.deepEqual(rows.infinity.map(m=>m.id),[1726,1771,429617]);
  assert.deepEqual(rows.multiverse.map(m=>m.id),[497698,1003596,1003598]);
  assert.equal(JSON.stringify(films),original);
  assert.equal(marvelUniverse.infinity.length,23);
  assert.equal(new Set([...marvelUniverse.infinity,...marvelUniverse.multiverse]).size,marvelUniverse.infinity.length+marvelUniverse.multiverse.length);
});
test('seen/unseen filters reuse valid owner ratings, including zero, in every shelf',()=>{
  const films=[movie(1726,'2008-04-30'),movie(1771,'2011-07-22')],reviews={'filmes:1726':{nota:0}};
  assert.deepEqual(marvelShelves(films,{today:'2026-10-28',filter:'seen',reviews}).infinity.map(m=>m.id),[1726]);
  assert.deepEqual(marvelShelves(films,{today:'2026-10-28',filter:'unseen',reviews}).infinity.map(m=>m.id),[1771]);
  assert.deepEqual(marvelShelves([]).recent,[]);
});
test('countdown uses midnight in Brazil, handles hydration and never becomes negative',()=>{
  const deadline=Date.parse('2026-12-17T03:00:00Z');
  assert.equal(Date.parse(marvelUniverse.release),deadline);
  assert.equal(doomsdayCountdown(null),null);
  assert.deepEqual(doomsdayCountdown(deadline-90061000),{days:1,hours:1,minutes:1,seconds:1,finished:false});
  assert.deepEqual(doomsdayCountdown(deadline+1000),{days:0,hours:0,minutes:0,seconds:0,finished:true});
});

test('countdown progress clamps to its configurable campaign window',()=>{
  assert.equal(doomsdayProgress(null),null);
  assert.equal(doomsdayProgress(0,100,200),0);
  assert.equal(doomsdayProgress(150,100,200),50);
  assert.equal(doomsdayProgress(300,100,200),100);
  assert.equal(doomsdayProgress(150,200,100),null);
  assert.equal(Date.parse(marvelUniverse.release)-Date.parse(marvelUniverse.countdownStart),90*86400000);
});
