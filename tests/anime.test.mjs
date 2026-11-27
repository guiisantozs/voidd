process.env.ANIME_CATALOG_PROVIDER='jikan';
process.env.JIKAN_API_BASE_URL='https://fixture-jikan.invalid/v4';
import test from 'node:test';
import assert from 'node:assert/strict';
import {animeId,decodeAnimeId,adjacentAnime} from '../lib/anime-provider.js';
import {createAnimeClient,normalizeAnime,searchAnime,getAnimeDetail,getAnimeSeason,getAnimeEpisode,getAnimeSection,clearAnimeCache} from '../lib/anime-catalog.js';
import {animeUniverses} from '../config/animes.js';
import {setWatchlistItem,readWatchlist,ANIME_LIST_KEY} from '../lib/movie-watchlist.js';
import {scopedStorage,readAccount,mergeCloud,syncAccount,importGuest} from '../lib/account-storage.js';
import {rankRecentSeriesReviews} from '../lib/series-community-ranking.js';
import {notificationHref} from '../lib/notifications.js';
import {writeSeriesUnit} from '../lib/series-unit-server.js';
import {createAnimePreferencesHandler,createAnimeTasteHandler} from '../lib/anime-personalization-server.js';
const row=(mal_id=1)=>({mal_id,title:'Anime',title_japanese:'Original',type:'TV',episodes:12,score:8,scored_by:100,genres:[{mal_id:1,name:'Action'}],aired:{from:'2020-01-01T00:00:00Z'},images:{jpg:{large_image_url:'https://cdn.myanimelist.net/a.jpg'}}});
const ok=data=>({ok:true,json:async()=>data});
test('anime identities preserve legacy IDs and separate media, providers and numeric keys',()=>{
 assert.equal(animeId(1),9000000001);assert.equal(decodeAnimeId(1),null);assert.equal(decodeAnimeId('9000000001'),1);
 for(const id of [0,-1,1e9,'abc',1.2])assert.equal(animeId(id),null);
 const item=normalizeAnime(row());assert.equal(item.nota,4);assert.equal(item.externalRating,8);assert.equal(item.tmdbRating,undefined);assert.equal(item.providerId,1);
 assert.deepEqual(adjacentAnime([item,item,{...item,id:2,categoria:'series'}]),[item]);assert.deepEqual(animeUniverses,[]);
});
test('Jikan shares pending requests, clones cache responses, expires and paces distinct calls',async()=>{
 let now=0,calls=0;const starts=[];
 const client=createAnimeClient({clock:()=>now,sleep:async ms=>{now+=ms;},fetcher:async()=>{calls++;starts.push(now);return ok({data:[row()]});}});
 const results=await Promise.all(Array.from({length:12},()=>client.resource('anime',{q:'anime'},1000)));assert.equal(calls,1);
 results[0].data[0].title='Changed';assert.equal((await client.resource('anime',{q:'anime'},1000)).data[0].title,'Anime');
 await client.resource('anime',{q:'other'},1000);assert.ok(starts[1]-starts[0]>=350);
 now=1001;await client.resource('anime',{q:'anime'},1000);assert.equal(calls,3);
});
test('rolling 60/min budget and Retry-After stop calls; provider errors never enter cache',async()=>{
 let now=100,calls=0;const limited=createAnimeClient({clock:()=>now,spacing:0,fetcher:async()=>{calls++;return ok({data:[]});}});
 for(let i=1;i<=60;i++)await limited.resource(`anime/${i}`);await assert.rejects(limited.resource('anime/61'),e=>e.status===429);assert.equal(calls,60);
 now+=60000;await limited.resource('anime/61');assert.equal(calls,61);
 let failed=0;const retry=createAnimeClient({clock:()=>now,spacing:0,fetcher:async()=>{failed++;return failed===1?{ok:false,status:429,headers:{get:()=> '10'}}:ok({data:[]});}});
 await assert.rejects(retry.resource('anime'),e=>e.status===429&&e.retryAfter===10);await assert.rejects(retry.resource('anime'),e=>e.status===429);assert.equal(failed,1);now+=10001;await retry.resource('anime');assert.equal(failed,2);
});
test('anime search pages use one public source call, exclude adult content and never hydrate cards',async()=>{
 const calls=[],resource=async(path,params)=>{calls.push({path,params});return {data:[row(1),{...row(2),rating:'Rx - Hentai'}],pagination:{has_next_page:true}};};
 const data=await searchAnime({q:'  Anime  ',page:2},{resource});assert.equal(calls.length,1);assert.equal(calls[0].path,'anime');assert.equal(calls[0].params.page,2);assert.equal(calls[0].params.sfw,true);assert.deepEqual(data.movies.map(r=>r.id),[9000000001]);assert.equal(data.next,'3:0');
 await assert.rejects(searchAnime({q:'a'},{resource}),/INVALID/);assert.equal(calls.length,1);
});
test('source-defined anime parts and episode pages never infer seasons or release dates',async()=>{
 const calls=[],resource=async(path,params)=>{calls.push({path,params});if(path.endsWith('/full'))return {data:{...row(),relations:[{relation:'Sequel',entry:[{type:'anime',mal_id:2,name:'Part 2'}]}]}};if(path.endsWith('/episodes/101'))return {data:{mal_id:101,title:'Episode',aired:'2020-02-01T03:00:00Z',synopsis:'Actual synopsis',duration:1440}};return {data:[{mal_id:101,title:'Episode',aired:null}],pagination:{has_next_page:true}};};
 const item=await getAnimeDetail(9000000001,{resource});assert.equal(item.seasons.length,1);assert.equal(item.seasons[0].sourceDefined,true);assert.equal(item.numberOfSeasons,null);assert.equal(item.related[0].id,9000000002);
 const season=await getAnimeSeason(item.id,1,{resource,page:2});assert.equal(season.episodes[0].airDate,null);assert.equal(season.nextPage,3);assert.equal(calls.at(-1).params.page,2);
 const episode=await getAnimeEpisode(item.id,101,{resource});assert.equal(episode.airDate,'2020-02-01');assert.equal(episode.overview,'Actual synopsis');assert.equal(episode.runtime,24);
 await assert.rejects(getAnimeSeason(item.id,2,{resource}),/INVALID/);
});
test('every trend entry point delegates to the shared discovery service, never historical top anime',async()=>{
 const calls=[],discovery={section:async(section,page)=>{calls.push({section,page});return {movies:[]};}};
 for(const section of ['editorial','hero','trending','weekly'])await getAnimeSection(section,1,{discovery,resource:async()=>{throw Error('Historical ranking must not run');}});
 assert.deepEqual(calls.map(row=>row.section),['editorial','hero','trending','weekly']);
});
const store=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
test('anime watchlists sync independently, preserve offline tombstones and isolate accounts/guests',async()=>{
 const storage=store(),one=scopedStorage(storage,'one'),two=scopedStorage(storage,'two'),item=normalizeAnime(row());
 for(const categoria of ['filmes','series','animes'])setWatchlistItem(one,{...item,categoria},true);
 setWatchlistItem(one,item,true);assert.equal(Object.keys(readWatchlist(one,'animes')).length,1);assert.deepEqual(readWatchlist(two,'animes'),{});
 const sent=[];await syncAccount({from:()=>({upsert:async rows=>{sent.push(...rows);return {error:null};}})},storage,'one');assert.ok(sent.some(r=>r.kind==='anime_watchlist'));
 const fresh=store();mergeCloud(fresh,'one',sent);assert.equal(readWatchlist(scopedStorage(fresh,'one'),'animes')[item.id].providerId,1);
 setWatchlistItem(one,item,false);mergeCloud(storage,'one',sent);assert.equal(readWatchlist(one,'animes')[item.id],undefined);assert.equal(readAccount(storage,'one').pending[`anime_watchlist:${item.id}`].payload,null);
 assert.ok(readWatchlist(one,'series')[item.id]);assert.ok(readWatchlist(one,'filmes')[item.id]);
 setWatchlistItem(storage,item,true);assert.equal(importGuest(storage,'two'),1);assert.ok(scopedStorage(storage,'two').getItem(ANIME_LIST_KEY));
});
test('anime community ranks only real authorized anime rows and notification links retain media',()=>{
 const now=Date.parse('2026-11-04T12:00:00Z'),item=normalizeAnime(row()),entry={user_id:'one',item_key:`animes:${item.id}`,rating:0,created_at:'2026-11-03T00:00:00Z',item};
 assert.equal(rankRecentSeriesReviews([entry],{now}).length,0);assert.equal(rankRecentSeriesReviews([entry,entry],{now,media:'animes'})[0].reviews,1);
 assert.match(notificationHref({entity_type:'review',entity_id:`owner/animes:${item.id}`}),/^\/obra\/animes\//);
});
test('wrong-media anime unit deletion is rejected before any database operation',async()=>{
 await assert.rejects(writeSeriesUnit({owner:'owner',body:{media:'series',seriesId:9000000001,seasonNumber:1,episodeNumber:1,operation:'remove'},reader:{from(){throw Error('DATABASE_TOUCHED');}}}),/INVALID/);
});
test('Jikan unit writes validate source episodes, keep general records untouched and accept zero/decimals',async t=>{
 clearAnimeCache();const calls=[],writes=[];
 t.mock.method(globalThis,'fetch',async url=>{const path=new URL(url).pathname;calls.push(path);return ok({data:path.endsWith('/full')?row():{mal_id:101,title:'Episode',aired:'2020-01-01T00:00:00Z'}});});
 const db={from:table=>({upsert:async record=>{writes.push({table,record});return {error:null};}})},base={reader:db,admin:db,owner:'owner'},form={rating:0,date:'2020-01-01',text:'Episode',public:false,spoiler:false};
 await writeSeriesUnit({...base,body:{operation:'review',media:'animes',seriesId:9000000001,seasonNumber:1,episodeNumber:101,form}});
 await writeSeriesUnit({...base,body:{operation:'review',media:'animes',seriesId:9000000001,seasonNumber:1,episodeNumber:0,form:{...form,rating:'4,2'}}});
 assert.deepEqual(writes.filter(r=>r.table==='void_series_unit_reviews').map(r=>[r.record.episode_number,r.record.rating]),[[101,0],[0,4.2]]);assert.equal(writes.some(r=>r.table==='void_records'),false);assert.equal(calls.length,2);
});
const response=()=>({headers:{},code:200,setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(body){this.body=body;return this;}});
test('anime preference writes bind the authenticated owner and reject legacy, duplicate and unreleased choices',async()=>{
 const writes=[],ids=[9000000001,9000000002,9000000003],reader={from:table=>{assert.equal(table,'void_anime_preferences');const q={upsert(value){writes.push(value);return q;},select(){return q;},single:async()=>({data:{anime_ids:ids,updated_at:'now'}})};return q;}},context=async()=>({reader,owner:'owner'}),metadata=async()=>({items:ids.map(id=>({...normalizeAnime(row(id-9000000000))})),partial:false});
 const handler=createAnimePreferencesHandler({context,metadata}),res=response();await handler({method:'POST',body:{ids,user_id:'forged'}},res);assert.equal(res.code,200);assert.deepEqual(writes,[{user_id:'owner',anime_ids:ids}]);assert.equal(res.headers['Cache-Control'],'private, no-store');
 for(const value of [[1,2,3],[ids[0],ids[0],ids[2]]]){const fail=response();await handler({method:'POST',body:{ids:value}},fail);assert.equal(fail.code,400);}
 const future=response();await createAnimePreferencesHandler({context,metadata:async()=>({items:ids.map(id=>({...normalizeAnime(row(id-9000000000)),estreia:'2099-01-01'}))})})({method:'POST',body:{ids}},future);assert.equal(future.code,400);assert.equal(writes.length,1);
 const unauthorized=response();await createAnimeTasteHandler({context:async()=>{throw Error('UNAUTHORIZED');}})({method:'GET'},unauthorized);assert.equal(unauthorized.code,401);assert.equal(unauthorized.headers['Cache-Control'],'private, no-store');
});
