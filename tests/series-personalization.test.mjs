import test from 'node:test';
import assert from 'node:assert/strict';
import {seriesTasteIds,rankTasteRecommendations} from '../lib/series-tastes.js';
import {tasteRecommendations} from '../lib/series-taste-catalog.js';
import {createSeriesPreferencesHandler,createSeriesTasteHandler,seriesPrivateContext} from '../lib/series-personalization-server.js';
import {seriesPrivateRequest} from '../lib/series-preferences-client.js';
import {normalizeSeries} from '../lib/series-model.js';
import {seriesMetadataClient} from '../lib/series-social.js';
const raw=(id,extra={})=>({id,name:`Série ${id}`,poster_path:'/poster.jpg',origin_country:['US'],original_language:'en',genre_ids:[18],first_air_date:'2020-01-01',vote_average:8,vote_count:1000,popularity:30,overview:'Uma investigação de crimes e segredos familiares.',...extra});
const item=(id,extra={})=>normalizeSeries(raw(id,extra));
const response=()=>({headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(data){this.data=data;return this;}});
function database(row=null){const calls=[],builder={};for(const method of ['select','eq','upsert'])builder[method]=(...args)=>{calls.push([method,...args]);return builder;};builder.maybeSingle=async()=>({data:row,error:null});builder.single=async()=>({data:{series_ids:calls.find(c=>c[0]==='upsert')?.[1].series_ids,updated_at:'now'},error:null});return {calls,reader:{from:table=>{assert.equal(table,'void_series_preferences');return builder;}}};}
test('preferences require exactly three distinct positive catalog IDs',()=>{
 assert.deepEqual(seriesTasteIds(['1',2,'3']),[1,2,3]);
 for(const ids of [null,[],[1,2],[1,2,3,4],[1,'1',2],[0,2,3],[-1,2,3],[1.2,2,3],['1 OR true',2,3],[true,2,3],[10000000000,2,3]])assert.throws(()=>seriesTasteIds(ids),/INVALID_PREFERENCES/);
});
test('different tastes change ranking; themes, plot and shared-universe evidence outrank unrelated popularity',()=>{
 const crime=[1,2,3].map(id=>item(id,{genre_ids:[80],keywords:{results:[{id:99,name:'organized crime'}]}}));
 const marvel=[1,2,3].map(id=>item(id,{genre_ids:[10765],overview:'Super-heróis protegem o multiverso.',keywords:{results:[{id:180547,name:'marvel cinematic universe (mcu)'}]}}));
 const candidates=[item(10,{genre_ids:[80],keywords:{results:[{id:99,name:'organized crime'}]}}),item(11,{genre_ids:[10765],overview:'Super-heróis salvam o multiverso.',keywords:{results:[{id:180547,name:'marvel cinematic universe (mcu)'}]}}),item(12,{genre_ids:[35],overview:'Uma comédia romântica.',popularity:100000})];
 assert.equal(rankTasteRecommendations(crime,candidates)[0].id,10);assert.equal(rankTasteRecommendations(marvel,candidates)[0].id,11);assert.equal(rankTasteRecommendations(marvel,candidates)[0].recommendationReason,'Universos e temas em comum');
});
test('recommendation filtering excludes choices, anime, future/weak/posterless shows and duplicate IDs/titles',()=>{
 const seeds=[1,2,3].map(id=>item(id)),pool=[...seeds,item(4),item(4),item(5,{name:'Série 4'}),item(6,{keywords:{results:[{id:210024,name:'anime'}]}}),item(7,{first_air_date:'2099-01-01'}),item(8,{vote_count:2}),item(9,{poster_path:null}),item(10,{vote_average:5})];
 assert.deepEqual(rankTasteRecommendations(seeds,pool).map(s=>s.id),[4]);
});
test('TMDB recommendations and similar seeds influence rank even without genre overlap',()=>{
 const seeds=[1,2,3].map(id=>item(id)),other=item(5,{genre_ids:[35],overview:'Romance leve.'});
 assert.equal(rankTasteRecommendations(seeds,[other]).length,0);
 assert.equal(rankTasteRecommendations(seeds,[other],new Map([['5',[{seed:'1',kind:'recommendations',rank:0}]]]))[0].id,5);
});
test('personalized catalog coalesces candidates and hydrates batches within shared endpoint limits',async()=>{
 const calls=[],batches=[],all=Array.from({length:55},(_,i)=>raw(i+10));
 const result=await tasteRecommendations([1,2,3],{today:'2026-10-30',resource:async(path,params)=>{calls.push([path,params]);return {results:all};},metadata:async ids=>{batches.push(ids);assert(ids.length<=20);return {items:ids.map(id=>item(Number(id))),partial:false};}});
 assert.equal(calls.filter(([path])=>path.endsWith('/recommendations')).length,3);assert.equal(calls.filter(([path])=>path.endsWith('/similar')).length,3);assert.equal(result.movies.length,18);
 assert.deepEqual(batches.map(b=>b.length),[3,20,20,2]);assert.equal(new Set(batches.slice(1).flat()).size,42);
});
test('metadata failure does not return a false completed personalized catalog',async()=>{
 await assert.rejects(tasteRecommendations([1,2,3],{metadata:async()=>({items:[],partial:true})}),/METADATA_UNAVAILABLE/);
 await assert.rejects(tasteRecommendations([1,2,3],{metadata:async()=>({items:[1,2,3].map(id=>item(id))}),resource:async()=>{throw Error();}}),/RECOMMENDATIONS_UNAVAILABLE/);
});
test('private preferences GET reads authenticated owner only with no shared caching',async()=>{
 const db=database({series_ids:[1,2,3],updated_at:'now'}),res=response();await createSeriesPreferencesHandler({context:async()=>({...db,owner:'owner-a'})})({method:'GET',query:{user_id:'owner-b'}},res);
 assert.deepEqual(db.calls.find(c=>c[0]==='eq'),['eq','user_id','owner-a']);assert.deepEqual(res.data.preferences.ids,[1,2,3]);assert.equal(res.headers['Cache-Control'],'private, no-store');assert.equal(res.headers.Vary,'Authorization');
});
test('save validates canonical metadata and cannot inject owner, review, favorite or completion fields',async()=>{
 const db=database(),res=response();await createSeriesPreferencesHandler({context:async()=>({...db,owner:'owner-a'}),metadata:async ids=>({items:ids.map(id=>item(id)),partial:false})})({method:'POST',body:{ids:[1,2,3],user_id:'owner-b',completed_at:'spoof',rating:5}},res);
 assert.equal(res.statusCode,200);assert.deepEqual(db.calls.find(c=>c[0]==='upsert')[1],{user_id:'owner-a',series_ids:[1,2,3]});
});
test('invalid, future or failed metadata never writes preferences',async()=>{
 for(const [ids,loaded,status] of [[[1,1,3],null,400],[[1,2,3],{items:[item(1)],partial:false},400],[[1,2,3],{items:[1,2,3].map(id=>item(id,{first_air_date:'2099-01-01'})),partial:false},400],[[1,2,3],{items:[],partial:true},502]]){
  const db=database(),res=response();await createSeriesPreferencesHandler({context:async()=>({...db,owner:'a'}),metadata:async()=>loaded})({method:'POST',body:{ids}},res);assert.equal(res.statusCode,status);assert.equal(db.calls.some(c=>c[0]==='upsert'),false);
 }
});
test('personalization reads saved own seeds rather than arbitrary URL/body input and handles incomplete state',async()=>{
 let received;const db=database({series_ids:[1,2,3]}),res=response();await createSeriesTasteHandler({context:async()=>({...db,owner:'a'}),recommend:async ids=>{received=ids;return {movies:[item(4)]};}})({method:'GET',query:{ids:'4,5,6'}},res);assert.deepEqual(received,[1,2,3]);assert.equal(res.data.movies[0].id,4);
 const empty=response();await createSeriesTasteHandler({context:async()=>({...database(),owner:'a'}),recommend:async()=>assert.fail('No preferences, no catalog call')})({method:'GET'},empty);assert.equal(empty.data.needsPreferences,true);
});
test('unauthenticated and forbidden operations fail without creating preferences',async()=>{
 await assert.rejects(seriesPrivateContext({headers:{}}),/UNAUTHORIZED/);
 const unauthorized=response();await createSeriesPreferencesHandler({context:async()=>{throw Error('UNAUTHORIZED');}})({method:'POST',body:{ids:[1,2,3]}},unauthorized);assert.equal(unauthorized.statusCode,401);
 const badMethod=response();await createSeriesPreferencesHandler({context:async()=>assert.fail()})({method:'DELETE'},badMethod);assert.equal(badMethod.statusCode,405);
});
test('browser helper refuses stale account sessions before any request and sends only chosen IDs',async()=>{
 let calls=0;const client={auth:{getSession:async()=>({data:{session:{user:{id:'b'},access_token:'test-only'}}})}},fetcher=async(path,options)=>{calls++;assert.equal(options.cache,'no-store');assert.deepEqual(JSON.parse(options.body),{ids:[1,2,3]});return {ok:true,json:async()=>({ok:true})};};
 await assert.rejects(seriesPrivateRequest(client,'a','/api/series/preferences',{fetcher}),/sessão mudou/);assert.equal(calls,0);
 await seriesPrivateRequest(client,'b','/api/series/preferences',{fetcher,ids:[1,2,3]});assert.equal(calls,1);
});
test('editor can recover available choices after one disappears without weakening other metadata consumers',async()=>{
 const fetcher=async()=>({ok:true,json:async()=>({items:[item(1),item(2)],partial:true})});
 await assert.rejects(seriesMetadataClient([1,2,3],null,fetcher),/METADATA_UNAVAILABLE/);
 assert.deepEqual((await seriesMetadataClient([1,2,3],null,fetcher,{allowPartial:true})).map(s=>s.id),[1,2]);
});
