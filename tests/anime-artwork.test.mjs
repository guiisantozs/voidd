import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnimeArtwork,largeAnimePoster,matchingArtwork} from '../lib/anime-artwork.js';
import {createPublicCatalogClient,PUBLIC_CATALOG_STORAGE} from '../lib/public-catalog-client.js';
const anime={id:9000000021,categoria:'animes',titulo:'One Piece',englishTitle:'One Piece',ano:'1999',format:'TV',poster:'https://cdn.myanimelist.net/images/anime/1/2l.jpg'};
const tv={id:37854,name:'One Piece',first_air_date:'1999-10-20',genre_ids:[16],original_language:'ja',media_type:'tv',poster_path:'/poster.jpg',backdrop_path:'/backdrop.jpg'};
test('artwork identity requires unique matching title, animation, language, year and production format',()=>{
 const art=matchingArtwork(anime,[tv]);assert.equal(art.artworkTmdbId,37854);assert.equal(art.poster,'https://image.tmdb.org/t/p/w780/poster.jpg');
 for(const changes of [{first_air_date:'2023-01-01'},{genre_ids:[18]},{original_language:'en'},{media_type:'movie'},{name:'One Piece Special'},{adult:true}])assert.equal(matchingArtwork(anime,[{...tv,...changes}]),null);
 assert.equal(matchingArtwork(anime,[tv,{...tv,id:123}]),null);assert.equal(matchingArtwork({...anime,format:'OVA'},[tv]),null);
 assert.equal(matchingArtwork({...anime,ano:''},[tv]),null);
});
test('MAL thumbnails use existing large variants without rewriting unknown hosts or paths',()=>{
 assert.equal(largeAnimePoster('https://cdn.myanimelist.net/r/100x140/images/anime/1244/138851.jpg'),'https://cdn.myanimelist.net/images/anime/1244/138851l.jpg');
 assert.equal(largeAnimePoster(anime.poster),anime.poster);
 for(const url of [null,'https://example.com/images/anime/1/2.jpg','https://cdn.myanimelist.net/images/characters/1/2.jpg'])assert.equal(largeAnimePoster(url),url);
});
test('ordinary catalogue rows share provider lookup and discovery pages without individual searches',async()=>{
 const calls=[],client=createAnimeArtwork({resource:async(path,params)=>{calls.push({path,params});return {results:path==='discover/tv'&&params.page===1?[tv]:[]};}});
 const [first,second]=await Promise.all([client.items([anime]),client.items([anime])]);
 assert.equal(calls.length,5);assert.equal(first[0].id,anime.id);assert.equal(first[0].categoria,'animes');assert.equal(second[0].posterProvider,'tmdb');await client.items([anime]);assert.equal(calls.length,5);
});
test('detail searches are bounded, cached and optional failures preserve source artwork',async()=>{
 let searches=0;const client=createAnimeArtwork({resource:async path=>{if(path.startsWith('search/')){searches++;return {results:[tv]};}return {results:[]};}});
 const a=await client.items([anime],{detail:true});await client.items([anime],{detail:true});assert.equal(searches,1);assert.equal(a[0].artworkTmdbId,37854);
 let calls=0;const failed=createAnimeArtwork({resource:async()=>{calls++;throw Error('offline');}});
 const aFailed=(await failed.items([anime],{detail:true}))[0],bFailed=(await failed.items([anime],{detail:true}))[0];
 assert.equal(aFailed.id,anime.id);assert.equal(aFailed.poster,anime.poster);assert.equal(aFailed.artworkMatchStatus,'lookup-failed');assert.equal(bFailed.poster,anime.poster);assert.equal(calls,6);
});
test('old trailer-based anime editorial cache is refreshed without invalidating other media',async()=>{
 const rows=[['/api/animes/editorial',{data:{hero:[{backdrop:'https://i.ytimg.com/old.jpg'}]},savedAt:1000,expires:10000}],['/api/series/editorial',{data:{hero:[{id:10}]},savedAt:1000,expires:10000}]];
 const storage={getItem:key=>key===PUBLIC_CATALOG_STORAGE?JSON.stringify({version:1,rows}):null,setItem(){}};let calls=0;
 const client=createPublicCatalogClient({clock:()=>2000,storage:()=>storage,fetcher:async()=>{calls++;return {ok:true,json:async()=>({artworkVersion:2,hero:[{id:21}]})};}});
 assert.equal((await client.request('/api/series/editorial')).hero[0].id,10);assert.equal(calls,0);
 assert.equal((await client.request('/api/animes/editorial')).hero[0].id,21);assert.equal(calls,1);
});
test('sequel artwork follows an explicit prequel and uniquely dated TMDB season without replacing the MAL work',async()=>{
 const child={...anime,id:9000000002,titulo:'One Piece New Season',englishTitle:'One Piece New Season',ano:'2026',estreia:'2026-10-01',trendSignals:{startDate:{year:2026,month:10,day:1},relations:[{relation:'PREQUEL',malId:21,artwork:anime}]}};
 const client=createAnimeArtwork({resource:async(path,params)=>path==='discover/tv'&&params.page===1?{results:[tv]}:path==='tv/37854'?{id:37854,seasons:[{season_number:2,air_date:'2026-10-01'}],images:{posters:[{file_path:'/wrong-original.jpg',width:1000,height:1500}],backdrops:[{file_path:'/franchise.jpg',width:1920,height:1080}]}}:path==='tv/37854/season/2/images'?{posters:[{file_path:'/season2.jpg',width:1000,height:1500}]}:{results:[]}});
 const [result]=await client.items([child],{detail:true});assert.equal(result.id,child.id);assert.equal(result.posterPath,'/season2.jpg');assert.equal(result.artworkSeasonNumber,2);assert.equal(result.backdropScope,'verified-franchise-season');
 const wrong=createAnimeArtwork({resource:async(path,params)=>path==='discover/tv'&&params.page===1?{results:[tv]}:path==='tv/37854'?{id:37854,seasons:[{season_number:2,air_date:'2025-10-01'}],images:{backdrops:[{file_path:'/wrong.jpg',width:1920,height:1080}]}}:{results:[]}});
 const fallback=(await wrong.items([child],{detail:true}))[0];assert.equal(fallback.id,child.id);assert.equal(fallback.poster,child.poster);assert.equal(fallback.backdropScope,'verified-franchise');assert.equal(fallback.artworkSeasonNumber,undefined);
});
