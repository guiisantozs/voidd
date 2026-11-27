import test from 'node:test';
import assert from 'node:assert/strict';
import { parseShareId, reviewShareId, sharePosterUrl } from '../lib/review-share.js';
import { readShareReview } from '../lib/review-share-server.js';
import { cardTree } from '../lib/review-card-image.js';
const owner='11111111-1111-4111-8111-111111111111',id=reviewShareId(owner,'jogos:58175');
const cover='https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co1tmu.jpg';
const row={updated_at:'2026-10-27T10:00:00Z',payload:{public:true,nota:0,spoiler:true,texto:'FINAL SECRETO',item:{id:58175,categoria:'jogos',titulo:'God of War',poster:'https://media.rawg.io/media/games/abc/test.jpg'}}};
function client(record=row,visibility='public') {return {rpc:async()=>({}),from:table=>{const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:table==='void_records'?record:{display_name:'Pessoa',username:'pessoa',visibility}})};return query;}};}
test('game share keys never collide with a movie using the same external ID',()=>{
 assert.equal(id,owner+'_jogos_58175');assert.deepEqual(parseShareId(id),{owner,game:'58175',itemKey:'jogos:58175'});assert.notEqual(id,reviewShareId(owner,'filmes:58175'));
});
test('authorized game cards resolve the same official cover first and hide spoiler text, including rating zero',async()=>{
 let calls=0;const model=await readShareReview(client(),id,null,{resolveCover:async game=>{calls++;assert.equal(game,'58175');return {body:{cover:{url:cover},fallback:{url:row.payload.item.poster}}};}});
 assert.equal(calls,1);assert.equal(model.poster,cover);assert.equal(model.coverSource,'IGDB');assert.equal(model.rating,0);assert.ok(!JSON.stringify(model).includes('FINAL SECRETO'));
 const tree=cardTree(model,{format:'feed',template:'poster',author:true,excerpt:true});assert.ok(JSON.stringify(tree).includes('RAWG'));assert.ok(!JSON.stringify(tree).includes('TMDB'));
});
test('game cover requests occur only after review, profile, owner and media authorization',async()=>{
 let calls=0;const options={resolveCover:async()=>{calls++;return {body:{}};}};
 await assert.rejects(readShareReview(client({...row,payload:{...row.payload,public:false}}),id,null,options),/NOT_FOUND/);
 await assert.rejects(readShareReview(client(row,'private'),id,null,options),/NOT_FOUND/);
 await assert.rejects(readShareReview(client(),reviewShareId(owner,'filmes:58175'),null,options),/NOT_FOUND/);assert.equal(calls,0);
 const own=await readShareReview(client({...row,payload:{...row.payload,public:false}}),id,owner,options);assert.equal(own.isPublic,false);assert.equal(calls,1);
});
test('game image whitelist prevents arbitrary fetch URLs, credentials, queries and movie crossovers',()=>{
 assert.equal(sharePosterUrl(cover,'jogos'),cover);assert.equal(sharePosterUrl(cover),null);
 for(const url of ['https://127.0.0.1/media/games/a.jpg',cover+'?url=secret',cover+'#secret',cover.replace('images.igdb.com','images.igdb.com.evil.test'),cover.replace('https://','https://user:pass@'),'https://media.rawg.io/private/data.jpg'])assert.equal(sharePosterUrl(url,'jogos'),null);
 assert.equal(sharePosterUrl(row.payload.item.poster,'jogos'),row.payload.item.poster);
 const steam='https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/620/library_600x900.jpg';
 assert.equal(sharePosterUrl(steam,'jogos'),steam);assert.equal(sharePosterUrl(steam),null);
});
