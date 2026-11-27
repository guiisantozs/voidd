import test from 'node:test';
import assert from 'node:assert/strict';
import {safeGamerArtwork,landscapeSources,playedGenrePills,favoriteGameHref} from '../lib/gamer-profile.js';
import {createGamerMediaSource,resolveGamerAppearance} from '../lib/gamer-profile-server.js';
import {createGamerMediaHandler} from '../pages/api/gamer-profile-media.js';

const rawg='https://media.rawg.io/media/games/fixture/art.jpg';
test('Gamer artwork uses provider-only HTTPS sources and ordered Steam landscape fallbacks',()=>{
 for(const url of ['javascript:alert(1)','https://example.test/image.jpg','https://media.rawg.io.evil.test/media/games/a.jpg','http://media.rawg.io/media/games/a.jpg',rawg+'?token=private','https://user:secret@media.rawg.io/media/games/a.jpg'])assert.equal(safeGamerArtwork(url),null);
 assert.equal(safeGamerArtwork(rawg),rawg);
 const sources=landscapeSources({platforms:[{provider:'steam',external_id:'620'}],cover_url:rawg},{rawg_background:rawg});
 assert.deepEqual(sources.map(url=>url.split('/').at(-1)),['library_hero.jpg','header.jpg','capsule_616x353.jpg','art.jpg']);
 assert.equal(favoriteGameHref({collection_id:'g',rawg_id:4200},'viewer'),'/jogos/colecao/g?target=viewer');
});
test('Most played genres use actual catalogue metadata weighted by recorded time, without title inference',()=>{
 const games=[{rawg_id:1,minutes:60},{rawg_id:2,minutes:120},{title:'FIFA football',minutes:10000}];
 assert.deepEqual(playedGenrePills(games,{1:{genres:['Sports']},2:{genres:['Action'],tags:['FPS','Invented']}}).map(row=>[row.name,row.minutes]),[['Ação',120],['FPS',120],['Esportes',60]]);
 assert.deepEqual(playedGenrePills(games),[]);
});
test('RAWG artwork resolves Steam identity only from a unique verified store link and caches public metadata',async()=>{
 let reads=0;
 const source=createGamerMediaSource({work:async()=>{reads++;return {titulo:'Portal 2',poster:rawg,backdrop:rawg,generos:['Action'],overviewFacts:{tags:[{name:'FPS'}]}};},stores:async()=>[{url:'https://evil.test/app/2/'},{url:'https://store.steampowered.com/app/620/Portal_2/'}]});
 const item=await source.media('4200');assert.equal(item.steam_appid,'620');assert.deepEqual(item.tags,['FPS']);
 await source.details('4200');assert.equal(reads,1);
 const ambiguous=createGamerMediaSource({work:async()=>({titulo:'Game'}),stores:async()=>[{url:'https://store.steampowered.com/app/1/'},{url:'https://store.steampowered.com/app/2/'}]});
 assert.equal((await ambiguous.media('1')).steam_appid,null);
});
test('Appearance saving resolves provider metadata and never accepts client URLs, titles or another account collection',async()=>{
 const source={media:async()=>({source:'rawg',id:'4200',rawg_id:4200,title:'Verified title',rawg_background:rawg,cover_url:rawg,steam_appid:'620'})};
 const saved=await resolveGamerAppearance(null,'owner','banner',{source:'rawg',id:'4200',variant:'hero',title:'Forged',url:'https://evil.test/image.jpg',x:99,y:150},{source});
 assert.equal(saved.title,'Verified title');assert(saved.url.endsWith('/620/library_hero.jpg'));assert.equal(saved.x,99);assert.equal(saved.y,40);
 assert.equal(await resolveGamerAppearance(null,'owner','banner',null),null);
 await assert.rejects(resolveGamerAppearance(null,'owner','visibility',null),/INVALID/);
 await assert.rejects(resolveGamerAppearance(null,'owner','banner',{source:'rawg',id:'4200',variant:'evil'},{source}),/INVALID/);
 const calls=[];const client={from(table){assert.equal(table,'void_game_activity');const chain={select(){return chain;},eq(key,value){calls.push([key,value]);return chain;},limit:async()=>({data:[]})};return chain;}};
 await assert.rejects(resolveGamerAppearance(client,'owner','favorite',{source:'collection',id:'00000000-0000-4000-8000-000000000082'},{source}),/INVALID/);
 assert(calls.some(([key,value])=>key==='user_id'&&value==='owner'));
});
test('Public artwork endpoint bounds batches, tolerates partial failures and never returns provider errors',async()=>{
 const handler=createGamerMediaHandler({details:async id=>{if(id==='2')throw Error('private-provider-credential');return {rawg_id:Number(id)};},media:async()=>{throw Error('private-provider-credential');}});
 async function request(query,method='GET'){const response={headers:{},setHeader(key,value){this.headers[key]=value;},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};await handler({method,query},response);return response;}
 assert.equal((await request({ids:'1,2,3,4,5,6,7,8,9'})).code,400);
 assert.equal((await request({ids:'1',id:'1'})).code,400);
 assert.equal((await request({id:'1'},'POST')).code,405);
 const partial=await request({ids:'1,2'});assert.equal(partial.code,200);assert.deepEqual(partial.data,{items:[{rawg_id:1}],partial:true});assert.equal(partial.headers['Cache-Control'],'no-store');
 const failed=await request({id:'1'});assert.equal(failed.code,502);assert(!JSON.stringify(failed.data).includes('private-provider'));
});
