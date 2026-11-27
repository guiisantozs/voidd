import test from 'node:test';
import assert from 'node:assert/strict';
import { createSteamFamilySource, familyTokenIdentity, playedFamilyGames, mergeSteamActivity } from '../lib/steam-family.js';
import { extractFamilyAuthorization, syncGameCollection } from '../lib/game-collection-client.js';
import { syncCollectionBatch } from '../lib/game-collection-server.js';
import { collectionStats } from '../lib/game-collection.js';

const steam = '76561198000000001', other = '76561198000000002';
const session = (sub=steam,exp=Math.floor(Date.now()/1000)+600) => `eyJhbGciOiJFZERTQSJ9.${Buffer.from(JSON.stringify({sub,exp})).toString('base64url')}.fixture`;

test('Family input accepts the full Steam response or a token, without accepting arbitrary pasted content',()=>{
 const token=session();
 assert.equal(extractFamilyAuthorization(token),token);
 assert.equal(extractFamilyAuthorization(JSON.stringify({success:1,data:{webapi_token:token}})),token);
 for(const input of ['','{"data":{}}','not a token','https://example.test','x'.repeat(17000)])assert.equal(extractFamilyAuthorization(input),null);
});

test('Family credential preflight rejects another account, expiry and malformed data before any request',async()=>{
 const source=createSteamFamilySource({fetcher:()=>assert.fail('Credential should not reach Steam')});
 for(const token of ['invalid',session(steam,1),session(other)])await assert.rejects(source.played(token,steam),/STEAM_FAMILY_(SESSION|ACCOUNT)/);
 assert.equal(familyTokenIdentity(session(),steam),steam);
});

test('Family source scopes both Steam calls to the linked account and only returns its normalized played games',async()=>{
 const token=session(),requests=[];
 const source=createSteamFamilySource({fetcher:async(input,options)=>{
  const url=new URL(input);requests.push(url);
  assert.equal(url.origin,'https://api.steampowered.com');assert.equal(url.searchParams.get('steamid'),steam);
  assert.equal(url.searchParams.get('access_token'),token);assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
  return {ok:true,json:async()=>({response:url.pathname.includes('GetFamilyGroupForUser')?{family_groupid:'123',family_group:{name:'private family',members:[{steamid:other}]}}:{owner_steamid:steam,apps:[
   {appid:367520,name:'Hollow Knight',rt_playtime:120,owner_steamids:[other]},
   {appid:2552430,name:'Kingdom Hearts',rt_playtime:57,owner_steamids:[other]},
   {appid:620,name:'Never played',rt_time_acquired:1000,rt_playtime:0},
  ]}})};
 }});
 const games=await source.played(token,steam);
 assert.equal(requests.length,2);assert.equal(requests[1].searchParams.get('include_own'),'true');
 assert.deepEqual(games.map(game=>game.appid),['367520','2552430']);
 for(const value of [token,other,'private family','owner_steamids','family_groupid'])assert(!JSON.stringify(games).includes(value));
});

test('Family source refuses unconfirmed identity, missing family, incomplete responses and provider errors without leaking credentials',async()=>{
 const token=session();
 const scenarios=[
  [{family_groupid:'123'},{owner_steamid:other,apps:[]},'STEAM_FAMILY_ACCOUNT'],
  [{is_not_member_of_any_group:true},null,'STEAM_FAMILY_MISSING'],
  [{family_groupid:'123'},{owner_steamid:steam},'STEAM_INCOMPLETE'],
 ];
 for(const [family,library,error] of scenarios){
  const source=createSteamFamilySource({fetcher:async url=>({ok:true,json:async()=>({response:String(url).includes('GetFamilyGroupForUser')?family:library})})});
  await assert.rejects(source.played(token,steam),new RegExp(error));
 }
 for(const status of [401,403,429,500]){
  const source=createSteamFamilySource({fetcher:async()=>({ok:false,status,json:async()=>assert.fail('Error body must not be read')})});
  await assert.rejects(source.played(token,steam),e=>!e.message.includes(token)&&/^STEAM_/.test(e.message));
 }
 await assert.rejects(createSteamFamilySource({fetcher:async()=>{throw Error('Secret URL '+token);}}).played(token,steam),/^Error: STEAM_UNAVAILABLE$/);
});

test('Family activity excludes unplayed/software/future activity and preserves unknown hours as null',()=>{
 const games=playedFamilyGames([
  {appid:1,rt_last_played:1000},{appid:2,rt_playtime:90},{appid:3,rt_time_acquired:1000},
  {appid:4,rt_playtime:0},{appid:5,rt_playtime:-3},{appid:6,rt_last_played:9999999999},
  {appid:7,rt_playtime:25,app_type:2},{appid:8,rt_playtime:'10'},
 ],2000000);
 assert.deepEqual(games.map(game=>game.appid),['1','2']);assert.equal(games[0].minutes,null);
 assert.equal(games[0].evidence,'last_played');assert.throws(()=>playedFamilyGames(null),/INCOMPLETE/);
});

test('Owned and family duplicates contribute once, with the highest cumulative time instead of the sum',()=>{
 const first={appid:'620',title:'Portal 2',minutes:60,last_played_at:'2026-01-01',evidence:'playtime'};
 const games=mergeSteamActivity([first],[{...first,minutes:90,last_played_at:'2026-02-01'},{appid:'367520',title:'Hollow Knight',minutes:120,evidence:'playtime'}]);
 const rows=games.map(game=>({provider:'steam',playtime_minutes:game.minutes,achievement_total:null,achievement_unlocked:null,platform_game:{game:{id:game.appid,title:game.title}}}));
 assert.equal(games.length,2);assert.equal(collectionStats(rows,1).games,2);assert.equal(collectionStats(rows,1).minutes,210);
 assert.equal(first.minutes,60);assert.equal(games[0].last_played_at,'2026-02-01');
});

test('Family sync persists only merged activity, enriches shared titles and resumes the same plan without a credential',async()=>{
 const token=session(),calls=[],committed=[];let active=null, familyReads=0;
 const own=[{appid:'620',title:'Portal 2',minutes:60,evidence:'playtime'}];
 const shared=[{appid:'620',title:'Portal 2',minutes:90,evidence:'playtime'},{appid:'367520',title:'Hollow Knight',minutes:120,evidence:'playtime'},{appid:'2552430',title:'Kingdom Hearts',minutes:57,evidence:'playtime'}];
 const admin={
  from(table){const chain={select(){return chain;},eq(){return chain;},order(){return chain;},range:async()=>({data:[]}),maybeSingle:async()=>({data:table==='void_steam_connections'?{steam_id:steam,connected_at:'2026-10-29'}:null})};return chain;},
  async rpc(name,args){calls.push({name,args});assert.equal(args.p_user,'owner');
   if(name==='void_collection_claim'){
    if(args.p_plan)active={id:'run',lease:'lease',source_account:steam,position:0,plan:args.p_plan.map(game=>Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(game))).reverse()))};
    return {data:active};
   }
   if(name==='void_collection_commit'){
    committed.push(...args.p_games);active.position+=args.p_count;
    return {data:{position:active.position,total:active.plan.length,done:active.position===active.plan.length,imported:active.position}};
   }
   return {data:null};
  }
 };
 const options={providerFactory:()=>({played:async id=>{assert.equal(id,steam);return own;},enrich:async(game,id)=>{assert.equal(id,steam);return {...game,achievement_status:'unavailable'};}}),familyFactory:()=>({played:async(value,id)=>{familyReads++;assert.equal(value,token);assert.equal(id,steam);return shared;}})};
 assert.equal((await syncCollectionBatch(admin,'owner',{...options,familyToken:token})).done,false);
 assert.equal((await syncCollectionBatch(admin,'owner',options)).done,true);
 assert.equal(familyReads,1);assert.equal(committed.length,3);
 assert.equal(committed.find(game=>game.appid==='620').minutes,90);
 assert(!JSON.stringify(calls).includes(token),'No credential may reach any database RPC');
});

test('Family account errors never create a job or commit an empty collection',async()=>{
 const calls=[];const admin={rpc:async(name,args)=>{calls.push({name,args});return {data:null};},from(){const chain={select(){return chain;},eq(){return chain;},maybeSingle:async()=>({data:{steam_id:steam,connected_at:'2026-10-29'}})};return chain;}};
 await assert.rejects(syncCollectionBatch(admin,'owner',{familyToken:session(other),providerFactory:()=>({played:async()=>[]}),familyFactory:()=>({played:async()=>{throw Error('STEAM_FAMILY_ACCOUNT');}})}),/STEAM_FAMILY_ACCOUNT/);
 assert.equal(calls.length,1);assert.equal(calls[0].args.p_plan,undefined);
});

test('Browser sends the family credential in the first POST body only, then resumes normal batches',async()=>{
 const token=session(),requests=[],original=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{requests.push({url,body:JSON.parse(init.body)});return {ok:true,json:async()=>({done:requests.length===2})};};
 const client={auth:{getSession:async()=>({data:{session:{user:{id:'owner'},access_token:'void-session-fixture'}}})}};
 try{
  await syncGameCollection(client,'owner',{familyToken:token});
  assert.deepEqual(requests.map(row=>row.body.action),['sync-family','sync']);
  assert.equal(requests[0].body.familyToken,token);assert.equal(requests[1].body.familyToken,undefined);
  assert(requests.every(row=>!row.url.includes(token)));
 }finally{globalThis.fetch=original;}
});

test('Ordinary sync rechecks imported shared games from the same connected account without needing a family token',async()=>{
 const plans=[],enriched=[],filters=[];
 const previous=[{external_id:'367520',playtime_minutes:120,last_played_at:null,evidence:'playtime',platform_game:{game:{title:'Hollow Knight'}}}];
 const admin={
  from(table){const chain={select(){return chain;},eq(key,value){if(table==='void_game_activity')filters.push([key,value]);return chain;},order(){return chain;},range:async()=>({data:previous}),maybeSingle:async()=>({data:table==='void_steam_connections'?{steam_id:steam,connected_at:'2026-10-29'}:null})};return chain;},
  async rpc(name,args){if(name==='void_collection_claim'){if(!args.p_plan)return {data:null};plans.push(args.p_plan);return {data:{id:'run',lease:'lease',source_account:steam,position:0,plan:args.p_plan}};}return {data:{done:true}};}
 };
 await syncCollectionBatch(admin,'owner',{providerFactory:()=>({played:async()=>[],enrich:async game=>{enriched.push(game.appid);return game;}}),familyFactory:()=>assert.fail('No family session is needed to refresh imported achievements')});
 assert.deepEqual(enriched,['367520']);assert.equal(plans[0].length,1);
 assert.deepEqual(filters,[['user_id','owner'],['provider','steam'],['source_account',steam]]);
});
