import test from 'node:test';
import assert from 'node:assert/strict';
import {createFanartArtwork,selectFanartArtwork} from '../lib/fanart-artwork.js';
import {animeHeroEligible,bestAnimeImage} from '../lib/anime-artwork-policy.js';
import {normalizeAnime} from '../lib/anime-catalog.js';
const background={url:'http://assets.fanart.tv/fanart/tv/1/background.jpg',width:'1920',height:'1080',likes:'4',lang:'00'};
const response=data=>({ok:true,status:200,json:async()=>data});
test('hero rejects trailer frames, vertical posters, narrow strips and low-resolution images',()=>{
 const valid={backdrop:'https://image.tmdb.org/t/p/original/a.jpg',backdropProvider:'tmdb',backdropWidth:3840,backdropHeight:2160};assert.equal(animeHeroEligible(valid),true);
 for(const changes of [{backdropProvider:'anilist',backdropWidth:1900,backdropHeight:400},{backdropWidth:1280,backdropHeight:720},{backdropWidth:1000,backdropHeight:1500},{backdropProvider:null},{backdrop:null}])assert.equal(animeHeroEligible({...valid,...changes}),false);
 assert.equal(normalizeAnime({mal_id:1,trailer:{youtube_id:'abcdefghijk',images:{maximum_image_url:'https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg'}}}).backdrop,null);
});
test('image selection prefers suitable poster languages and rejects thumbnails regardless of votes',()=>{
 const row={width:1000,height:1500,iso_639_1:'en',file_path:'/en.jpg'},pt={...row,iso_639_1:'pt',file_path:'/pt.jpg'};
 assert.equal(bestAnimeImage([{...row,width:225,height:350,vote_average:10,vote_count:1000},row,pt],'poster').file_path,'/pt.jpg');
 assert.equal(bestAnimeImage([{width:1900,height:400,vote_average:10}],'backdrop'),null);
});
test('Fanart only accepts full-size trusted artwork with dimensions and correct orientation',()=>{
 const art=selectFanartArtwork({showbackground:[background,{...background,url:'https://evil.example/a.jpg',likes:'999'}],tvposter:[{...background,width:'1000',height:'1500',url:'https://assets.fanart.tv/fanart/tv/1/poster.jpg'}]});
 assert.equal(art.backdrop,'https://assets.fanart.tv/fanart/tv/1/background.jpg');assert.equal(art.backdropWidth,1920);assert.equal(art.posterProvider,'fanart');
 assert.deepEqual(selectFanartArtwork({showbackground:[{...background,url:'https://assets.fanart.tv/preview/a.jpg'},{...background,width:null},{...background,height:'400'}]}),{});
});
test('Fanart requires a key and TVDB mapping; never sends MAL or TV TMDB IDs to its TV endpoint',async()=>{
 let calls=0;const client=createFanartArtwork({key:()=>'',fetcher:async()=>{calls++;return response({});}});await client.get({type:'tv',tmdbId:37854,tvdbId:81797});assert.equal(calls,0);
 const ready=createFanartArtwork({key:()=> 'test-only',fetcher:async url=>{calls++;assert.equal(url.pathname,'/v3.2/tv/81797');return response({thetvdb_id:'81797',showbackground:[background]});}});
 assert.deepEqual(await ready.get({type:'tv',tmdbId:37854}),{});const a=await ready.get({type:'tv',tmdbId:37854,tvdbId:81797});assert.equal(calls,1);assert.equal(a.backdropProvider,'fanart');
});
test('Fanart deduplicates, caches public artwork and refuses mismatched provider identities',async()=>{
 let calls=0;const client=createFanartArtwork({key:()=> 'test-only',fetcher:async()=>{calls++;return response({tmdb_id:'100',moviebackground:[background]});}});
 const [a,b]=await Promise.all([client.get({type:'movie',tmdbId:100}),client.get({type:'movie',tmdbId:100})]);assert.equal(calls,1);a.backdrop='changed';assert.notEqual(b.backdrop,a.backdrop);await client.get({type:'movie',tmdbId:100});assert.equal(calls,1);
 const wrong=createFanartArtwork({key:()=> 'test-only',fetcher:async()=>response({tmdb_id:200,moviebackground:[background]})});assert.deepEqual(await wrong.get({type:'movie',tmdbId:100}),{});
});
test('Fanart 429 respects Retry-After without retries; missing art is cached separately',async()=>{
 let now=0,calls=0;const client=createFanartArtwork({clock:()=>now,key:()=> 'test-only',fetcher:async()=>{calls++;return {ok:false,status:429,headers:{get:()=> '120'}};}});
 await client.get({type:'movie',tmdbId:100});now=61000;await client.get({type:'movie',tmdbId:100});assert.equal(calls,1);now=121000;await client.get({type:'movie',tmdbId:100});assert.equal(calls,2);
 let missingCalls=0;const missing=createFanartArtwork({clock:()=>now,key:()=> 'test-only',fetcher:async()=>{missingCalls++;return {ok:false,status:404};}});await missing.get({type:'movie',tmdbId:1});await missing.get({type:'movie',tmdbId:1});assert.equal(missingCalls,1);now+=3600001;await missing.get({type:'movie',tmdbId:1});assert.equal(missingCalls,2);
});
