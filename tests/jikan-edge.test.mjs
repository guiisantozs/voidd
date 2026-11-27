import test from 'node:test';
import assert from 'node:assert/strict';
import {edgeDate,edgeRequest,edgeResponse,JIKAN_EDGE_URL} from '../lib/jikan-edge.js';
import {normalizeAnime,getAnimeSection,getAnimeSeason,getAnimeEpisode,searchAnime,createAnimeClient,animeResource,clearAnimeCache} from '../lib/anime-catalog.js';
import {searchProfileMedia,clearProfileSearchCache} from '../lib/profile-search.js';
import {createAnimeTrendSource} from '../lib/anime-trend-source.js';
const row=(id=1)=>({malId:id,title:`Anime ${id}`,titleEnglish:'English',titleJapanese:'Original',imageUrl:'https://cdn.myanimelist.net/image.jpg',images:{medium:'https://cdn.myanimelist.net/image.jpg',large:'https://cdn.myanimelist.net/large.jpg'},score:8.5,type:'TV',episodes:150,startDate:'20261002',genres:[{malId:1,name:'Action'}]});
const response=(data,pagination)=>({data,meta:{cached:true,stale:false,...(pagination?{pagination}:{})}});
test('Edge normalizes complete dates but never invents a day from partial dates',()=>{
 for(const value of ['2026-10-02','20261002','Oct 2, 2026(JST)','Oct 2, 2026'])assert.equal(edgeDate(value),'2026-10-02');
 for(const value of ['20260000','20261000','Oct 2026 -','2026','Unknown',null,'20260230','Feb 30, 2026'])assert.equal(edgeDate(value),null);
});
test('Edge keeps canonical MAL IDs, supplied scores without invented vote counts, images, titles and flattened relations',()=>{
 const raw={...row(1735),trailer:{youtubeId:'abcdefghijk'},scoredBy:123,studios:[{malId:1,name:'Studio'}],relations:[{malId:20,type:'anime',title:'Naruto',relation:'Prequel'}],streaming:[{name:'Off',url:'https://example.invalid',available:false}]};
 const parsed=edgeResponse('anime/1735/full',response(raw)),item=normalizeAnime(parsed.data);
 assert.equal(item.id,9000001735);assert.equal(item.providerId,1735);assert.equal(item.provider,'jikan-edge');assert.equal(item.nota,4.25);assert.equal(item.externalRating,8.5);assert.equal(item.externalVoteCount,123);assert.equal(item.poster,raw.images.large);assert.equal(item.estreia,'2026-10-02');assert.deepEqual(item.genreIds,[1]);assert.equal(parsed.data.relations[0].entry[0].mal_id,20);assert.equal(parsed.data.trailer.youtube_id,'abcdefghijk');assert.deepEqual(parsed.data.streaming,[]);
 const sparse=normalizeAnime(edgeResponse('anime',response([row()])).data[0]);assert.equal(sparse.nota,4.25);assert.equal(sparse.externalVoteCount,null);assert.equal(normalizeAnime({...parsed.data,score:0,scored_by:0}).nota,null);
});
test('Edge requests use only supported params and share calendar requests across local pages',async()=>{
 assert.deepEqual(edgeRequest('top/anime',{filter:'airing',limit:25,page:2,sfw:true}),{filter:'airing',page:2});assert.deepEqual(edgeRequest('seasons/now',{page:2,sfw:true,limit:20}),{});
 const query={q:'naruto',genres:'1',start_date:'2020-01-01',end_date:'2020-12-31',order_by:'members',page:2,sfw:true,limit:20,genres_exclude:'12,49'};
 assert.deepEqual(Object.keys(edgeRequest('anime',query)),['q','genres','start_date','end_date','order_by','page']);
 let calls=0;const client=createAnimeClient({spacing:0,fetcher:async url=>{calls++;assert.equal(new URL(url).origin,'https://jikan.lucashdo.com');return {ok:true,json:async()=>response(Array.from({length:45},(_,i)=>row(i+1)))};}});
 const resource=client.resource,first=await getAnimeSection('new-seasons',1,{resource}),second=await getAnimeSection('new-seasons',2,{resource});assert.equal(calls,1);assert.equal(first.movies.length,20);assert.equal(second.movies.length,20);assert.equal(first.totalPages,3);assert.equal(second.movies[0].id,9000000021);
});
test('Edge pagination retains hasNext without inventing a total and never truncates a selector source page',async t=>{
 delete process.env.ANIME_CATALOG_PROVIDER;delete process.env.JIKAN_EDGE_BASE_URL;clearAnimeCache();clearProfileSearchCache();
 t.mock.method(globalThis,'fetch',async url=>{assert.ok(String(url).startsWith(JIKAN_EDGE_URL));return {ok:true,json:async()=>response(Array.from({length:50},(_,i)=>row(i+1)),{page:1,limit:50,count:50,total:null,hasNextPage:true})};});
 const data=await searchProfileMedia({media:'animes',q:'Example'});assert.equal(data.items.length,50);assert.equal(data.items.at(-1).id,9000000050);assert.equal(data.pagination.hasNext,true);
 const normalized=edgeResponse('top/anime',response([row()],{page:1,limit:50,count:1,total:null,hasNextPage:true}));assert.equal(normalized.pagination.has_next_page,true);assert.equal(normalized.pagination.last_visible_page,undefined);assert.equal(normalized.pagination.items.total,null);
});
test('Edge distinguishes parent MAL ID from episode number, validates both and converts supplied episode dates/duration',async()=>{
 const resource=async path=>edgeResponse(path,path.endsWith('/full')?response({...row(1735),aired:{from:'2007-02-15'}}):path.endsWith('/101')?response({malId:1735,episode:101,title:'Episode 101',aired:'Mar 26, 2009(JST)',duration:'00:24:00'}):response([{number:101,title:'Episode 101',aired:'Mar 26, 2009'}],{page:2,hasNextPage:true}));
 const season=await getAnimeSeason(9000001735,1,{resource,page:2});assert.equal(season.episodes[0].episodeNumber,101);assert.equal(season.nextPage,3);
 const episode=await getAnimeEpisode(9000001735,101,{resource});assert.equal(episode.seriesId,9000001735);assert.equal(episode.episodeNumber,101);assert.equal(episode.airDate,'2009-03-26');assert.equal(episode.runtime,24);
 assert.throws(()=>edgeResponse('anime/1735/episodes/101',response({malId:1,episode:101})),/SOURCE/);assert.throws(()=>edgeResponse('anime/1735/episodes/101',response({malId:1735,episode:1})),/SOURCE/);
});
test('Edge current calendar hydrates at most 24 verified candidates and preserves canonical IDs',async()=>{
 const calls=[],now=new Date('2026-11-04T12:00:00Z'),resource=async path=>{calls.push(path);return edgeResponse(path,path==='seasons/now'?response(Array.from({length:50},(_,i)=>row(i+1))):response({...row(Number(path.split('/')[1])),synopsis:'Real synopsis'}));};
 const source=createAnimeTrendSource({clock:()=>now,resource,detail:async id=>normalizeAnime((await resource('anime/'+(id-9000000000)+'/full')).data),fetcher:async()=>{throw Error('offline');},regional:async()=>({entries:Array.from({length:50},(_,i)=>({source:'Google Trends RSS',country:'BR',title:'Anime '+(i+1),date:'2026-11-03T12:00:00Z'}))})});
 const result=await source(),items=[...result.hero,...result.trending];assert.equal(calls.length,25);assert.equal(items.length,24);assert.equal(result.hero.length,5);assert.ok(items.every(item=>item.sinopse==='Real synopsis'));assert.equal(new Set(items.map(item=>item.id)).size,items.length);assert.equal(calls[0],'seasons/now');
});
test('Edge maps actual character/voice and staff shapes and recommendations',()=>{
 const cast=edgeResponse('anime/1/characters',response([{malId:3,name:'Character',voiceActors:[{malId:7,name:'Voice',language:'Japanese',imageUrl:'https://example.invalid/voice.jpg'}]}])).data[0];assert.equal(cast.character.name,'Character');assert.equal(cast.voice_actors[0].person.mal_id,7);
 const staff=edgeResponse('anime/1/staff',response([{malId:8,name:'Director',role:'Director'}])).data[0];assert.deepEqual(staff.positions,['Director']);assert.equal(staff.person.name,'Director');
 const rec=edgeResponse('anime/1/recommendations',response([{malId:205,title:'Samurai Champloo',imageUrl:'https://example.invalid/image.jpg',votes:122}])).data[0];assert.equal(rec.entry.mal_id,205);assert.equal(rec.entry.score,undefined);
});
