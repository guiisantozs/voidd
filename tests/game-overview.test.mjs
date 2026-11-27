// Explicitly exercise the retained RAWG adapter; IGDB has its own fixtures.
process.env.GAME_CATALOG_PROVIDER = 'rawg';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gameOverviewFacts,pcRequirementLines,safeGameStores,releaseCountdown,overviewDistribution} from '../lib/game-overview.js';
import {createGameOverviewSource} from '../lib/game-overview-source.js';
import {parseGameSearch,searchGames} from '../lib/game-search.js';
import handler from '../pages/api/game-overview.js';

test('overview facts preserve provider semantics and never infer completion time or PC requirements',()=>{
  const facts=gameOverviewFacts({playtime:12,esrb_rating:{name:'Teen'},platforms:[{platform:{slug:'pc'},requirements:{minimum:'<p>Minimum:</p><p>OS: Windows</p><br>Memory: 8 GB',recommended:'<b>Recommended:</b>\nGPU: 4 GB'}}],tags:[{id:1,name:'Atmospheric',language:'eng'},{id:2,name:'Other',language:'rus'}],developers:[{id:3,name:'Studio'}]});
  assert.equal(facts.playtime,12);assert.equal(facts.platformCount,1);assert.equal(facts.esrb,'Teen');
  assert.deepEqual(facts.requirements.minimum,['OS: Windows','Memory: 8 GB']);
  assert.deepEqual(facts.tags,[{id:1,name:'Atmospheric'}]);assert.deepEqual(facts.developers,[{id:3,name:'Studio'}]);
  assert.equal(gameOverviewFacts({platforms:[{platform:{slug:'xbox'},requirements:{minimum:'PC only'}}],playtime:0}).requirements,null);
  assert.equal(gameOverviewFacts({playtime:0}).playtime,null);
  assert.ok(pcRequirementLines('<img src=x onerror=alert(1)>Memory: 8 GB').every(line=>!line.includes('<')));
});

test('store links reject unsafe URLs, lookalike hosts, credentials, duplicates and unrelated stores',()=>{
  const stores=safeGameStores(['javascript:alert(1)','https://store.steampowered.com.evil.test/','https://user:pass@gog.com/x','https://example.test/x','https://store.steampowered.com/app/12','http://store.steampowered.com/app/13','https://store.playstation.com/en-us/product/14','https://www.gog.com/en/game/test'].map(url=>({url})));
  assert.deepEqual(stores.map(store=>store.name),['Steam','PlayStation Store','GOG']);
  assert.ok(stores.every(store=>store.url.startsWith('https://')));
});

test('release countdown uses São Paulo midnight, hides released/invalid dates; score bins preserve zero',()=>{
  assert.deepEqual(releaseCountdown('2026-10-25',new Date('2026-10-24T01:30:00-03:00')),{days:0,hours:22,minutes:30});
  assert.equal(releaseCountdown('2026-10-24',new Date('2026-10-24T00:00:00-03:00')),null);
  for(const value of ['','2026-02-31','wrong','2026-13-10'])assert.equal(releaseCountdown(value),null);
  const bins=overviewDistribution([{rating:0,total:2},{rating:4.4,total:3},{rating:4.8,total:1},{rating:9,total:9}]);
  assert.equal(bins.find(bin=>bin.rating===0).total,2);assert.equal(bins.reduce((sum,bin)=>sum+bin.total,0),6);
});

test('independent RAWG sources deduplicate in-flight requests, normalize related games and retry failed parts',async()=>{
  const calls=[];let failed=true;
  const load=createGameOverviewSource({credentials:()=> 'fixture-key',fetcher:async url=>{
    calls.push(new URL(url));
    if(url.pathname.endsWith('/movies')){if(failed){failed=false;throw Error('offline');}return {results:[]};}
    if(url.pathname.endsWith('/stores'))return {results:[{url:'https://store.steampowered.com/app/12'}]};
    if(url.pathname.endsWith('/screenshots'))return {results:[{image:'https://media.rawg.io/media/scene.jpg'}]};
    if(url.pathname.endsWith('/12'))return {developers:[{id:44,name:'Studio'}]};
    return {results:[{id:12,name:'Self',background_image:'self'},{id:13,name:'Other',background_image:'art'},{id:13,name:'Duplicate',background_image:'art'},{id:14,name:'Missing art'}]};
  }});
  await Promise.all([load('12','facts'),load('12','facts'),load('12','studio')]);
  assert.equal(calls.filter(url=>url.pathname==='/api/games/12').length,1);
  const studio=calls.find(url=>url.searchParams.has('developers'));assert.equal(studio.searchParams.get('developers'),'44');
  const related=await load('12','series');assert.equal(related.length,1);assert.equal(related[0].id,13);assert.equal(related[0].categoria,'jogos');
  await assert.rejects(load('12','trailer'));assert.equal(await load('12','trailer'),null);
  assert.equal((await load('12','screenshots')).length,1);assert.equal((await load('12','stores'))[0].name,'Steam');
  assert.ok(calls.every(url=>url.origin==='https://api.rawg.io'&&url.searchParams.get('key')==='fixture-key'));
});

test('overview API rejects repeated parts, traversal, non-positive IDs and mutations before provider access',async()=>{
  const res=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(data){this.data=data;return this;}});
  for(const query of [{id:'../12',part:'facts'},{id:'0',part:'facts'},{id:['12','13'],part:'facts'},{id:'12',part:['facts']},{id:'12',part:'secrets'}]){const response=res();await handler({method:'GET',query},response);assert.equal(response.code,400);}
  const response=res();await handler({method:'POST',query:{id:'12',part:'facts'}},response);assert.equal(response.code,405);assert.equal(response.headers.Allow,'GET');
});

test('tag, developer and publisher links reach RAWG as validated IDs',async t=>{
  const previous=process.env.RAWG_API_KEY;process.env.RAWG_API_KEY='fixture-key';t.after(()=>{if(previous===undefined)delete process.env.RAWG_API_KEY;else process.env.RAWG_API_KEY=previous;});
  let called;t.mock.method(globalThis,'fetch',async url=>{called=new URL(url);return {ok:true,json:async()=>({results:[]})};});
  await searchGames(parseGameSearch({tag:'18',developer:'44',publisher:'55'}));
  for(const [key,value] of [['tags','18'],['developers','44'],['publishers','55']])assert.equal(called.searchParams.get(key),value);
  for(const query of [{tag:'atmospheric'},{developer:['44']},{publisher:'https://test'}])assert.throws(()=>parseGameSearch(query));
});
