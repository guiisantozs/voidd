import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnimeSimilar,animeRecommendationMetadata} from '../lib/anime-similar.js';
const card=(n,extra={})=>({id:9000000000+n,categoria:'animes',titulo:'Anime '+n,poster:'https://cdn.myanimelist.net/images/anime/1/1.jpg',genreIds:[1],nota:4,...extra});
test('recommendation outages retain matching local catalogue, exclude seasons/self/adult and deduplicate franchise extras',async()=>{
 const rows=[card(1),card(2),card(3),card(4,{genreIds:[12]}),card(5)],cache={catalog:async()=>rows,peek:async()=>rows[0],get:async(k,load)=>load()};
 const similar=createAnimeSimilar({cache,franchise:async()=>({seasons:[rows[0],rows[1]],specials:[rows[2]]}),resource:async()=>{throw Error('offline');}}),result=await similar(rows[0].id);assert.deepEqual(result.movies.map(x=>x.id),[rows[2].id,rows[4].id]);assert.equal(result.retryable,false);
});
test('empty provider failures are retryable, and unverified recommendations cannot introduce adult content',async()=>{
 const cache={catalog:async()=>[],peek:async()=>null,get:async(k,load)=>load()},franchise=async()=>({seasons:[],specials:[]});
 const empty=await createAnimeSimilar({cache,franchise,resource:async()=>{throw Error('offline');}})(9000000001);assert.equal(empty.retryable,true);
 const safe=await createAnimeSimilar({cache,franchise,resource:async()=>({data:[{entry:{mal_id:2,title:'Unknown',images:{jpg:{image_url:'https://example.com/a.jpg'}}}}]}),metadata:async()=>[]})(9000000001);assert.equal(safe.movies.length,0);
});
test('identical recommendation metadata batches share one lookup and reject ambiguous or adult MAL matches',async()=>{const saved=new Map(),cache={get:(key,load)=>{if(!saved.has(key))saved.set(key,load());return saved.get(key);}};let calls=0;const fetcher=async()=>{calls++;return {ok:true,json:async()=>({data:{Page:{media:[{idMal:1,isAdult:false,title:{english:'Safe'}},{idMal:2,isAdult:true},{idMal:3,isAdult:false},{idMal:3,isAdult:false}]}}})};};const rows=[card(1),card(2),card(3)],options={cache,fetcher};const [a,b]=await Promise.all([animeRecommendationMetadata(rows,options),animeRecommendationMetadata([...rows].reverse(),options)]);assert.equal(calls,1);assert.deepEqual(a.map(x=>x.id),[card(1).id]);assert.deepEqual(b.map(x=>x.id),[card(1).id]);});
