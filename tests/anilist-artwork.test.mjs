import test from 'node:test';
import assert from 'node:assert/strict';
import {createAniListArtwork} from '../lib/anilist-artwork.js';
import {createAnimeArtwork} from '../lib/anime-artwork.js';
import {animeHeroEligible} from '../lib/anime-artwork-policy.js';
const item=id=>({id:9000000000+id,categoria:'animes',provider:'jikan-edge',titulo:`Anime ${id}`,poster:'https://cdn.myanimelist.net/original.jpg',backdrop:null});
const row=id=>({id:1000+id,idMal:id,isAdult:false,coverImage:{extraLarge:`https://s4.anilist.co/cover/${id}.jpg`},bannerImage:`https://s4.anilist.co/banner/${id}.jpg`});
const response=media=>({ok:true,json:async()=>({data:{Page:{media,pageInfo:{hasNextPage:false}}}})});
test('AniList artwork batches, deduplicates overlapping requests and caches by canonical MAL ID',async()=>{
 let calls=0;const client=createAniListArtwork({fetcher:async(url,options)=>{calls++;assert.equal(url,'https://graphql.anilist.co');assert.equal(options.method,'POST');assert.equal(options.headers.Authorization,undefined);return response(JSON.parse(options.body).variables.ids.map(row));}});
 const [a,b]=await Promise.all([client.items([item(1),item(2)]),client.items([item(2)])]);
 assert.equal(calls,1);assert.equal(a[0].id,item(1).id);assert.equal(a[0].provider,'jikan-edge');assert.equal(b[0].poster,row(2).coverImage.extraLarge);assert.equal(a[0].posterPath,null);assert.equal(a[0].posterFallback,item(1).poster);
 await client.items([item(1)]);assert.equal(calls,1);
});
test('AniList splits fifty cards into two bounded batches, never fifty separate queries',async()=>{
 let calls=0;const client=createAniListArtwork({fetcher:async(url,options)=>{calls++;const ids=JSON.parse(options.body).variables.ids;assert.ok(ids.length<=25);return response(ids.map(row));}});
 const items=await client.items(Array.from({length:50},(_,i)=>item(i+1)));assert.equal(calls,2);assert.equal(items.filter(i=>i.artworkProvider==='anilist').length,50);
});
test('ambiguous MAL mappings, adult entries and untrusted image URLs preserve source artwork',async()=>{
 const client=createAniListArtwork({fetcher:async()=>response([row(1),{...row(1),id:999},{...row(2),isAdult:true},{...row(3),coverImage:{extraLarge:'https://example.com/a.jpg'},bannerImage:'http://s4.anilist.co/a.jpg'},row(99)])});
 const original=[item(1),item(2),item(3),item(4)];assert.deepEqual(await client.items(original),original);
});
test('429 does not retry or break catalogue data, and enforces Retry-After',async()=>{
 let now=0,calls=0;const client=createAniListArtwork({clock:()=>now,fetcher:async()=>{calls++;return {ok:false,status:429,headers:{get:()=> '120'}};}});
 assert.deepEqual(await client.items([item(1)]),[item(1)]);now=61000;await client.items([item(2)]);assert.equal(calls,1);now=121000;await client.items([item(3)]);assert.equal(calls,2);
});
test('expired artwork refreshes, while missing artwork is negatively cached',async()=>{
 let now=0,calls=0;const client=createAniListArtwork({clock:()=>now,fetcher:async()=>{calls++;return response([]);}});
 await client.items([item(1)]);await client.items([item(1)]);assert.equal(calls,1);now=3600001;await client.items([item(1)]);assert.equal(calls,2);
});

test('a directly opened sequel resolves a full-HD TMDB franchise background from the same batched artwork query',async()=>{
 let calls=0;
 const child={...item(2),titulo:'Sequel',englishTitle:'Sequel',ano:'2026',format:'TV',estreia:'2026-10-01'};
 const parent={idMal:1,type:'ANIME',isAdult:false,format:'TV',title:{romaji:'Original',english:'Original'},startDate:{year:2017}};
 const client=createAniListArtwork({fetcher:async()=>{calls++;return response([{...row(2),relations:{edges:[{relationType:'PREQUEL',node:parent},{relationType:'CHARACTER',node:{...parent,idMal:3}},{relationType:'PREQUEL',node:{...parent,idMal:4,isAdult:true}}]}}]);}});
 const [mapped]=await client.items([child]);await client.items([child]);assert.equal(calls,1);assert.deepEqual(mapped.franchiseReferences.map(ref=>ref.id),[9000000001]);
 const tmdb=createAnimeArtwork({fanart:{enabled:()=>false},resource:async(path,params)=>{
  if(path==='discover/tv'&&params.page===1)return {results:[{id:55,media_type:'tv',name:'Original',first_air_date:'2017-10-01',genre_ids:[16],original_language:'ja',poster_path:'/original.jpg'}]};
  if(path==='tv/55')return {id:55,images:{backdrops:[{file_path:'/fullhd.jpg',width:1920,height:1080}]}};
  return {results:[]};
 }});
 const [detail]=await tmdb.items([mapped],{detail:true});assert.equal(detail.id,child.id);assert.equal(detail.titulo,child.titulo);assert.equal(detail.backdropScope,'verified-franchise');assert.equal(animeHeroEligible(detail),true);
 // Existing transitive references discovered on the home must also survive.
 const [merged]=await client.items([{...child,franchiseReferences:[{id:9000000005,titulo:'Earlier'}]}]);assert.deepEqual(merged.franchiseReferences.map(ref=>ref.id),[9000000005,9000000001]);
});
