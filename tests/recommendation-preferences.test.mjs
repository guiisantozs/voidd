import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendationPreferences,recommendationReason,ownMovieReviews,movieGenreIds} from '../lib/recommendation-preferences.js';
import {normalizeDetail} from '../lib/movie-detail.js';
import {recommendationReady,excludeReviewed} from '../lib/movie-community.js';

const review=(id,nota,genreIds)=>({item_key:`filmes:${id}`,payload:{nota,item:{id,genreIds}}});
test('TMDB detail genres survive normalization and can be saved with reviews',()=>{
 assert.deepEqual(normalizeDetail({id:1,title:'Teste',genres:[{id:878,name:'Ficção científica'}]}).genreIds,[878]);
});
test('minimum counts actual 4/5 reviews including decimals, not favorites or total history',async()=>{
 const data=await recommendationPreferences([review(1,4,[18]),review(2,'4,5',[18]),review(3,0,[18]),review(4,3.9,[18])],()=>{throw Error('should not fetch');});
 assert.equal(data.count,4);assert.equal(data.qualifying,2);assert.equal(recommendationReady(data),false);
 assert.deepEqual(data.excluded,['1','2','3','4']);
});
test('sufficient reviews use existing genres and do not require favorito or public visibility',async()=>{
 const data=await recommendationPreferences([review(1,4,[18]),review(2,4.1,[18,878]),review(3,5,[878])],()=>{throw Error('should not fetch');});
 assert.equal(recommendationReady(data),true);assert.deepEqual(data.genres,['18','878']);
 assert.equal(recommendationReason({genreIds:[878]},data.genres),'Gênero: Ficção científica');
 assert.deepEqual(excludeReviewed([{id:1},{id:4}],data.excluded),[{id:4}]);
});
test('old reviews without genres recover on demand, normalize explicit /10 and exclude by item_key',async()=>{
 const rows=[review(11,4),review(12,4.5,[]),review(13,8)];rows[2].payload.ratingScale=10;rows[0].payload.item.id=999;
 const calls=[];const data=await recommendationPreferences(rows,async id=>{calls.push(id);return [878];});
 assert.equal(data.qualifying,3);assert.equal(recommendationReady(data),true);assert.deepEqual(calls.sort(),['11','12','13']);
 assert.deepEqual(data.excluded,['11','12','13']);
 await assert.rejects(recommendationPreferences(rows,async()=>{throw Error('TMDB offline');}),/offline/);
});
test('server reads only authenticated owner, correct media, non-tombstoned reviews, paginated',async()=>{
 const calls=[];const query={select(...v){calls.push(['select',...v]);return this;},eq(...v){calls.push(['eq',...v]);return this;},like(...v){calls.push(['like',...v]);return this;},not(...v){calls.push(['not',...v]);return this;},order(){return this;},async range(){return {data:[],error:null};}};
 await ownMovieReviews({from:table=>{assert.equal(table,'void_records');return query;}},'owner');
 assert.ok(calls.some(c=>c.join(':')==='eq:user_id:owner'));assert.ok(calls.some(c=>c.join(':')==='like:item_key:filmes:%'));assert.ok(calls.some(c=>c[0]==='not'&&c[1]==='payload'));
});
test('legacy metadata recovery caches public TMDB genres without private records',async()=>{
 const fetch=globalThis.fetch,key=process.env.TMDB_API_KEY;process.env.TMDB_API_KEY='fixture';let calls=0;
 globalThis.fetch=async()=>{calls++;return {ok:true,json:async()=>({genres:[{id:18}]})};};
 try{assert.deepEqual(await movieGenreIds(9876543),['18']);await movieGenreIds(9876543);assert.equal(calls,1);}
 finally{globalThis.fetch=fetch;if(key===undefined)delete process.env.TMDB_API_KEY;else process.env.TMDB_API_KEY=key;}
});
