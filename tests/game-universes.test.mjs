import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gameUniverses,gameUniverseBySlug } from '../game-universes.config.js';
import { createGameUniverseLoader,officialUniverseDecision,OFFICIAL_GAME_TYPES,gameUniverseGroup,gameUniverseDetailProps } from '../lib/game-universes.js';
import { gameUniverseView,universeGameHref } from '../lib/game-universe-model.js';
import handler from '../pages/api/game-universes/[slug].js';

// Read-only IGDB metadata captured on 2026-10-26, without credentials or user data.
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/game-universes-igdb.json',import.meta.url),'utf8'));
const tlou=gameUniverseBySlug('the-last-of-us');
const original=fixture[tlou.slug].find(row=>row.id===1009);
const expected=[1009,6036,11790,26192,204350,277143].sort((a,b)=>a-b);

test('each universe owns its accent, verified structured IDs, official studios and exception lists',()=>{
  assert.deepEqual(gameUniverses.map(row=>row.nome),['God of War','Grand Theft Auto','The Last of Us','The Legend of Zelda']);
  for(const universe of gameUniverses){assert.ok(universe.collectionIds.length);assert.ok(universe.officialStudios.length);assert.ok(Array.isArray(universe.allowlist));assert.ok(Array.isArray(universe.denylist));assert.equal(universe.cor,universe.accent);}
  for(const slug of ['dc','__proto__','../god-of-war',['god-of-war'],undefined])assert.equal(gameUniverseBySlug(slug),undefined);
});

test('actual Last of Us metadata produces exactly the six requested games and the Left Behind exception',()=>{
  assert.deepEqual(fixture[tlou.slug].filter(row=>officialUniverseDecision(row,tlou)==='official').map(row=>row.id).sort((a,b)=>a-b),expected);
  assert.ok(tlou.allowlist.includes(11790));
  const left=fixture[tlou.slug].find(row=>row.id===11790);
  assert.equal(officialUniverseDecision({...left,game_type:{id:2}},tlou),'official');
  assert.equal(gameUniverseGroup(left,tlou),'spinoffs');
  assert.equal(officialUniverseDecision(left,{...tlou,denylist:[...tlou.denylist,left.id]}),'denylist');
});

test('current game_type policy rejects DLC, bundles, mods, packs, updates and unknown types',()=>{
  assert.deepEqual(OFFICIAL_GAME_TYPES,[0,4,8,9,10,11]);
  for(const type of [0,4,8,9,10,11])assert.equal(officialUniverseDecision({...original,game_type:{id:type}},tlou),'official');
  for(const type of [1,2,3,5,6,7,12,13,14,99])assert.equal(officialUniverseDecision({...original,game_type:{id:type}},tlou),'type');
  assert.equal(officialUniverseDecision({...original,game_type:undefined},tlou),'type');
});

test('studio identity, structured membership, cover, edition and development-state checks fail closed',()=>{
  assert.equal(officialUniverseDecision({...original,involved_companies:[{developer:true,company:{id:999999}}]},tlou),'studio');
  assert.equal(officialUniverseDecision({...original,involved_companies:[{supporting:true,company:{id:401}}]},tlou),'studio');
  assert.equal(officialUniverseDecision({...original,collections:[]},tlou),'unrelated');
  assert.equal(officialUniverseDecision({...original,cover:null},tlou),'cover');
  assert.equal(officialUniverseDecision({...original,cover:{image_id:'../../unsafe'}},tlou),'cover');
  assert.equal(officialUniverseDecision({...original,version_parent:1009},tlou),'edition');
  for(const status of [2,3,6,7])assert.equal(officialUniverseDecision({...original,game_status:{id:status}},tlou),'unreleased-state');
  for(const name of ['The Last of Us (itch)','The Last of Us Demo','The Last of Us Interactive Poster'])assert.equal(officialUniverseDecision({...original,name},tlou),'non-game');
});

test('actual God of War and GTA fixtures exclude guest crossovers and repack collections',()=>{
  for(const slug of ['god-of-war','grand-theft-auto']){
    const universe=gameUniverseBySlug(slug),rows=fixture[slug],official=rows.filter(row=>officialUniverseDecision(row,universe)==='official');
    assert.ok(official.length>=10);
    assert.ok(official.every(row=>OFFICIAL_GAME_TYPES.includes(row.game_type.id)&&row.cover?.image_id));
    assert.ok(rows.filter(row=>row.game_type?.id===3).every(row=>officialUniverseDecision(row,universe)!=='official'));
  }
  assert.equal(officialUniverseDecision(fixture['god-of-war'].find(row=>row.id===7390),gameUniverseBySlug('god-of-war')),'denylist');
});

test('structured loading shares cache, preserves RAWG identity and seeds covers without title-based IGDB calls',async()=>{
  let clock=0,igdbCalls=0,rawgCalls=0;
  const load=createGameUniverseLoader({now:()=>clock,key:()=> 'private-test-key',request:async(endpoint,body)=>{
    igdbCalls++;assert.equal(endpoint,'games');assert.ok(body.includes('collections=(864)'));assert.ok(body.includes('game_type.type'));assert.ok(!body.includes('search '));return fixture[tlou.slug];
  },fetcher:async url=>{rawgCalls++;assert.equal(url.origin,'https://api.rawg.io');return {count:0,results:[]};}});
  const [a,b]=await Promise.all([load(tlou.slug),load(tlou.slug)]);
  assert.equal(a,b);assert.equal(igdbCalls,1);assert.equal(rawgCalls,1);assert.equal(a.total,6);
  assert.deepEqual(a.games.map(game=>game.igdbId).sort((x,y)=>x-y),expected);
  assert.ok(a.games.every(game=>game.id===tlou.rawgIds[game.igdbId]&&game.officialCover.source==='IGDB'));
  assert.deepEqual(a.facts.firstYear,2013);assert.equal(a.facts.lastYear,2024);
  assert.ok(!JSON.stringify(a).includes('private-test-key'));
  await load(tlou.slug);assert.equal(igdbCalls,1);
  clock=3600001;await load(tlou.slug);assert.equal(igdbCalls,2);
});

test('community entries remain separate from official totals, years and progress',async()=>{
  const load=createGameUniverseLoader({key:()=> 'fixture',request:async()=>fixture[tlou.slug],fetcher:async()=>({count:2,results:[{id:447754,name:'The last of us (itch)',released:'2017-01-01',genres:[],parent_platforms:[]},{id:42392,name:'The Last of Us: Abandoned Territories Map Pack',released:'2013-10-15',genres:[],parent_platforms:[]}]})});
  const data=await load(tlou.slug);
  assert.equal(data.total,6);assert.equal(data.extras.length,2);
  assert.equal(data.extras.find(game=>game.id===447754).entryKind,'community');assert.equal(data.extras.find(game=>game.id===42392).entryKind,'extra');
  const view=gameUniverseView(data,{3990:{status:'finished'},447754:{status:'finished'},51325:{status:'playing'}});
  assert.equal(view.finished,1);assert.equal(view.hasLibraryGames,true);assert.equal(view.games.length,6);
  assert.equal(view.start.igdbId,1009);assert.equal(view.groups.flatMap(group=>group.games).length,5);
  assert.deepEqual(view.groups.map(group=>group.key),['main','remasters','spinoffs']);
});

test('provider outages never promote community rows into an official collection',async()=>{
  const load=createGameUniverseLoader({key:()=> 'fixture',request:async()=>{throw Error('IGDB_UNAVAILABLE');},fetcher:async()=>({count:0,results:[]})});
  await assert.rejects(load(tlou.slug),/IGDB_UNAVAILABLE/);await assert.rejects(load('dc'),/NOT_FOUND/);
});

test('unmatched editions open internally without substituting another work identity',async()=>{
  const universe=gameUniverseBySlug('god-of-war');
  const edition={id:null,igdbId:123,titulo:'Edition',categoria:'jogos',official:true};
  const linked={...edition,id:58175,igdbId:456};
  assert.equal(universeGameHref(universe,edition),'/jogos/universos/god-of-war/123');
  assert.equal(universeGameHref(universe,linked),'/obra/jogos/58175');
  const load=async()=>({games:[edition,linked],extras:[{...edition,igdbId:789,official:false}]});
  const result=await gameUniverseDetailProps({slug:universe.slug,gameId:'123'},{load});
  assert.equal(result.props.item,edition);assert.equal(result.props.item.id,null);
  assert.deepEqual(await gameUniverseDetailProps({slug:universe.slug,gameId:'456'},{load}),{redirect:{destination:'/obra/jogos/58175',permanent:false}});
  for(const gameId of ['789','999','0','-1','1e2','../123','123?redirect=https://evil.invalid',['123']])assert.deepEqual(await gameUniverseDetailProps({slug:universe.slug,gameId},{load}),{notFound:true});
  assert.deepEqual(await gameUniverseDetailProps({slug:'dc',gameId:'123'},{load}),{notFound:true});
  assert.equal((await gameUniverseDetailProps({slug:universe.slug,gameId:'123'},{load:async()=>{throw Error('OUTAGE');}})).props.error,true);
});

test('internal edition details preserve catalogue text, art and credits without manufacturing ratings',async()=>{
  const universe=gameUniverseBySlug('god-of-war'),row=fixture[universe.slug].find(item=>officialUniverseDecision(item,universe)==='official'&&!universe.rawgIds[item.id]);
  assert.ok(row);
  const load=createGameUniverseLoader({key:()=> 'fixture',request:async()=>[{...row,summary:'Actual catalogue description',genres:[{name:'Adventure'}],screenshots:[{image_id:'valid_picture'},{image_id:'../../bad'}]}],fetcher:async()=>({count:0,results:[]})});
  const item=(await load(universe.slug)).games[0];
  assert.equal(item.id,null);assert.equal(item.igdbId,row.id);assert.equal(item.nota,null);
  assert.equal(item.sinopse,'Actual catalogue description');assert.deepEqual(item.generos,['Adventure']);
  assert.deepEqual(item.screenshots,['https://images.igdb.com/igdb/image/upload/t_1080p/valid_picture.jpg']);
  assert.ok(item.informacoes.length>0);
});

test('the API rejects unsupported methods and unknown slugs without loading providers',async()=>{
  const res={headers:{},setHeader(key,value){this.headers[key]=value;},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
  await handler({method:'POST',query:{slug:tlou.slug}},res);assert.equal(res.code,405);assert.equal(res.headers.Allow,'GET');
  for(const slug of ['dc',[tlou.slug]]){await handler({method:'GET',query:{slug}},res);assert.equal(res.code,404);}
});
