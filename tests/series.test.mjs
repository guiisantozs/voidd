import test from 'node:test';
import assert from 'node:assert/strict';
import {SERIES_RULES,essentialSeriesIds} from '../config/series.js';
import {seriesAllowed,normalizeSeries,seriesPreferences,adjacentSeries,rankSeriesActivity,monthsBefore,recentSeasons,rankSeriesSignals,mixSeriesTrends} from '../lib/series-model.js';
import {seriesCommunity} from '../lib/series-social.js';
import {seriesRequest,getSeriesSection,clearSeriesCache,seriesMetadata,searchSeries} from '../lib/series-catalog.js';
import {parseMovieSearch} from '../lib/movie-search-options.js';
import {seriesGenreNames} from '../config/series.js';
import {movieHref,movieReviewHref} from '../lib/movie-sections.js';
process.env.TMDB_API_KEY='test-only';
const raw=(id,extra={})=>({id,name:`Série ${id}`,poster_path:'/poster.jpg',backdrop_path:'/backdrop.jpg',origin_country:['US'],original_language:'en',genre_ids:[18],first_air_date:'2020-01-01',vote_average:8.6,vote_count:200,popularity:12,...extra});
const item=(id,extra={})=>normalizeSeries(raw(id,extra));
test('one anime policy covers Japanese animation, original language, keyword-marked anime and posterless items',()=>{
 assert.equal(seriesAllowed(raw(1,{origin_country:['JP'],genre_ids:[16]})),false);
 assert.equal(seriesAllowed(raw(1,{original_language:'ja',genre_ids:[16]})),false);
 assert.equal(seriesAllowed(raw(1,{keywords:{results:[{name:'anime'}]}})),false);
 assert.equal(seriesAllowed(raw(1,{poster_path:null})),false);
 assert.equal(seriesAllowed(raw(1,{adult:true})),false);
 assert.equal(seriesAllowed(raw(1,{origin_country:['JP'],genre_ids:[18]})),true);
 assert.equal(seriesAllowed(raw(1,{genre_ids:[16]})),true);
});
test('TV normalization retains source /10 facts while /5 display, seasons and routes remain correct',()=>{
 const show=item(1,{number_of_seasons:4});assert.equal(show.nota,4.3);assert.equal(show.tmdbRating,8.6);assert.equal(show.numberOfSeasons,4);assert.equal(show.categoria,'series');
 assert.equal(item(2,{vote_count:0}).nota,null);assert.equal(item(2,{vote_average:0}).nota,0);
 assert.equal(movieHref(show),'/obra/series/1');assert.equal(movieHref({id:1,categoria:'filmes'}),'/filme/1');assert.equal(movieReviewHref(show).query.categoria,'series');
});
test('adjacent shelves remove previous titles without mutating candidates or letting anime through',()=>{
 const before=[item(1),item(2)],pool=[item(2),item(3),{...item(4),isAnime:true}];assert.deepEqual(adjacentSeries(pool,before).map(item=>item.id),[3]);assert.equal(pool.length,3);
});
test('recommendations combine private own reviews and favorites, reject other media and keep seen/favorite IDs excluded',()=>{
 const rows=[{item_key:'series:1',payload:{nota:4,is_public:false}},{item_key:'series:2',payload:{nota:4.5}},{item_key:'series:8',payload:{nota:0}},{item_key:'filmes:9',payload:{nota:5}}],favorites=[{external_id:3}];
 const prefs=seriesPreferences(rows,favorites,[item(1),item(2),item(3)]);assert.equal(prefs.ready,true);assert.equal(prefs.count,3);assert.deepEqual(prefs.genres,[18]);assert.deepEqual(prefs.excluded,['1','2','8','3']);
 assert.equal(seriesPreferences(rows,[],[item(1),item(2)]).ready,false);
});
test('Void ranking counts unique real reviews, preserves zero and combines comments without a catalogue score substitution',()=>{
 const rows=[{item_key:'series:1',user_id:'a',rating:0,comments:2},{item_key:'series:1',user_id:'a',rating:0,comments:2},{item_key:'series:2',user_id:'b',rating:4,comments:0},{item_key:'filmes:3',user_id:'c',rating:5,comments:200}];
 const ranked=rankSeriesActivity(rows,[item(1),item(2)]);assert.equal(ranked[0].id,1);assert.equal(ranked[0].reviews,1);assert.equal(ranked[0].comments,2);assert.equal(ranked.length,2);
});
test('TV requests validate sections and use source-supported genres/keywords and explicit vote thresholds',()=>{
 const request=seriesRequest('acclaimed');assert.equal(request.params['vote_count.gte'],SERIES_RULES.acclaimed.minVotes);assert.equal(request.params['vote_average.gte'],8);
 assert.equal(seriesRequest('crime').params.with_genres,'80|9648');assert.equal(seriesRequest('horror').theme.keyword,'horror');assert.doesNotThrow(()=>seriesRequest('essentials'));assert.doesNotThrow(()=>seriesRequest('new-seasons'));
 for(const args of [['unknown'],['drama',0],['drama',501],['recommended',1,'18|999999'],['recommended',1,'x']])assert.throws(()=>seriesRequest(...args),/INVALID/);
});
test('hero/trending share public source calls, resolve seasons, reject keyword anime and reuse cached metadata',async()=>{
 clearSeriesCache();let calls=0;const fetcher=async url=>{calls++;if(url.pathname.includes('/trending/tv/'))return {results:Array.from({length:10},(_,i)=>raw(i+1,{vote_count:2000})),total_pages:2};const id=Number(url.pathname.split('/').at(-1));return raw(id,{vote_count:2000,number_of_seasons:3,keywords:{results:id===2?[{name:'anime'}]:[]}});};
 const [hero,trending]=await Promise.all([getSeriesSection('hero',1,{fetcher}),getSeriesSection('trending',1,{fetcher})]);assert.equal(calls,13);assert.equal(hero.movies[0].numberOfSeasons,3);assert.equal(hero.movies.some(item=>item.id===2),false);assert.equal(trending.movies.some(item=>item.id===2),false);
 await getSeriesSection('hero',1,{fetcher});assert.equal(calls,13);
 await assert.rejects(seriesMetadata(['1','bad'],{fetcher}),/INVALID/);
});
test('essentials hydrate editorial identities, use real ratings and reject weak or anime entries without random filler',async()=>{
 clearSeriesCache();const calls=[];const data=await getSeriesSection('essentials',1,{fetcher:async url=>{calls.push(url.pathname);const id=Number(url.pathname.split('/').at(-1));return raw(id,{vote_count:id===essentialSeriesIds[0]?20:4000,keywords:{results:id===essentialSeriesIds[1]?[{name:'anime'}]:[]}});}});
 assert.equal(calls.length,essentialSeriesIds.length);assert(data.movies.every(item=>essentialSeriesIds.includes(item.id)));assert.equal(data.movies.some(item=>item.id===essentialSeriesIds[0]||item.id===essentialSeriesIds[1]),false);assert.equal(data.totalPages,1);
});
test('series title/year/genre search uses TV requests, filters source and metadata anime and returns a valid next cursor',async()=>{
 clearSeriesCache();const urls=[];const fetcher=async url=>{urls.push(url);if(url.pathname.endsWith('/search/tv'))return {results:[raw(1),raw(2,{genre_ids:[16],origin_country:['JP']}),raw(3)],total_pages:1};const id=Number(url.pathname.split('/').at(-1));return raw(id,{keywords:{results:id===3?[{name:'anime'}]:[]}});};
 const options=parseMovieSearch({q:'Uma série',genre:'18',year:'2020'},Object.entries(seriesGenreNames)),result=await searchSeries(options,{fetcher});assert.deepEqual(result.movies.map(row=>row.id),[1]);assert.equal(result.next,null);assert.equal(urls[0].searchParams.get('first_air_date_year'),'2020');assert.equal(urls[0].searchParams.get('query'),'Uma série');
 assert.throws(()=>parseMovieSearch({genre:'27'},Object.entries(seriesGenreNames)),/INVALID/);
});


test('season curation uses real season premieres, ignores future/unknown/special/old seasons, and deduplicates shows',()=>{
 assert.equal(monthsBefore('2026-08-31',6),'2026-02-28');
 const show=raw(1,{vote_count:5000,seasons:[{season_number:0,air_date:'2026-10-01',episode_count:2},{season_number:2,air_date:'2026-06-01',episode_count:8},{season_number:3,air_date:'2026-10-01',episode_count:8},{season_number:4,air_date:'2026-11-01',episode_count:8}]});
 const rows=recentSeasons([show,show,raw(2,{vote_count:5000,seasons:[{season_number:2,air_date:'2025-10-29',episode_count:8}]}),raw(3,{vote_count:10,seasons:show.seasons}),raw(4,{vote_count:5000,seasons:[{season_number:2,air_date:null,episode_count:8}]})],'2026-10-30',12);
 assert.equal(rows.length,1);assert.equal(rows[0].seasonNumber,3);assert.equal(rows[0].seasonStartDate,'2026-10-01');assert.equal(rows[0].estreia,'2020-01-01');
});
test('season discovery expands 6/9/12 months, never duplicates upstream details and keeps recent relevant seasons first',async()=>{
 clearSeriesCache();const requests=[],today='2026-10-30',fetcher=async url=>{requests.push(url);if(url.pathname.endsWith('/discover/tv'))return {results:[raw(1,{vote_count:5000}),raw(2,{vote_count:5000}),raw(3,{vote_count:5})],total_pages:1};const id=Number(url.pathname.split('/').at(-1));return raw(id,{vote_count:5000,seasons:[{season_number:2,air_date:id===1?'2026-09-01':'2026-01-01',episode_count:8}]});};
 const result=await getSeriesSection('new-seasons',1,{today,fetcher});assert.deepEqual(result.movies.map(item=>item.id),[1,2]);assert.equal(result.windowMonths,12);
 const discovery=requests.filter(url=>url.pathname.endsWith('/discover/tv'));assert.deepEqual(discovery.map(url=>url.searchParams.get('air_date.gte')),['2026-04-30','2026-01-30','2025-10-30']);assert(discovery.every(url=>url.searchParams.get('air_date.lte')===today));assert.equal(requests.filter(url=>/\/tv\/\d+$/.test(url.pathname)).length,2);
 await getSeriesSection('new-seasons',1,{today,fetcher});assert.equal(requests.length,5);
});
test('season discovery stops at six months when sufficient, without weakening quality requirements',async()=>{
 clearSeriesCache();let discovery=0;const result=await getSeriesSection('new-seasons',1,{today:'2026-10-30',fetcher:async url=>{if(url.pathname.endsWith('/discover/tv')){discovery++;return {results:Array.from({length:12},(_,i)=>raw(i+1,{vote_count:5000})),total_pages:1};}const id=Number(url.pathname.split('/').at(-1));return raw(id,{vote_count:5000,seasons:[{season_number:2,air_date:'2026-10-01',episode_count:8}]});}});assert.equal(result.windowMonths,6);assert.equal(result.movies.length,12);assert.equal(discovery,1);
});
test('trend mixing retains historical reviewed titles, weights recent writes, keeps zero, and includes unreviewed trends once',()=>{
 const now=Date.parse('2026-10-30'),reviews=[{user_id:'a',item_key:'series:1',rating:0,updated_at:'2020-01-01'},{user_id:'b',item_key:'series:2',rating:4,updated_at:'2026-10-29'},{user_id:'b',item_key:'series:2',rating:4,updated_at:'2026-10-29'}],ranked=rankSeriesSignals(reviews,[item(1),item(2)],now);
 assert.deepEqual(ranked.map(item=>item.id),[2,1]);assert.equal(ranked[0].reviews,1);const mixed=mixSeriesTrends([item(3),item(2)],ranked);assert.equal(mixed.length,3);assert(mixed.some(item=>item.id===1));assert(mixed.some(item=>item.id===3));assert.equal(mixed.find(item=>item.id===2).reviews,1);
});
test('community uses only the recent authorized feed and its saved artwork, without historical/global filler or TMDB calls',async()=>{
 const calls=[],created_at=new Date(Date.now()-86400000).toISOString(),snapshot={user_id:'a',item_key:'series:96677',created_at,rating:0,item:item(96677),comments:2};
 const client={from:()=>{throw Error('No history scan');},rpc:(name,args)=>{calls.push({name,args});return {abortSignal:async()=>({data:{rows:[snapshot],cursor:null},error:null})};}},original=globalThis.fetch;
 try{globalThis.fetch=async()=>{throw Error('No external metadata');};const data=await seriesCommunity(client,new AbortController().signal);assert.equal(data.movies[0].id,96677);assert.equal(data.movies[0].reviews,1);assert.equal(calls.length,1);assert.equal(calls[0].name,'void_reviews_feed');assert.equal(calls[0].args.filters.period,'week');assert.equal(calls[0].args.filters.sort,'recent');assert.equal(data.limited,false);}finally{globalThis.fetch=original;}
});
