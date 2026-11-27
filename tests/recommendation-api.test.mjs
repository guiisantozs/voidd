import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../pages/api/movie-recommendations.js';

test('authenticated pipeline: progress and trending fallback, enough reviews and legacy genre recovery',async t=>{
 const originalFetch=globalThis.fetch,names=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','TMDB_API_KEY'],old=names.map(name=>process.env[name]);
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='fixture';process.env.TMDB_API_KEY='fixture';
 t.after(()=>{globalThis.fetch=originalFetch;names.forEach((name,i)=>{if(old[i]===undefined)delete process.env[name];else process.env[name]=old[i];});});
 let rows=[],recoveries=0;
 const owner='11111111-1111-4111-8111-111111111111';
 globalThis.fetch=async input=>{
  const url=new URL(input),json=body=>new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
  if(url.pathname==='/auth/v1/user')return json({id:owner});
  if(url.pathname==='/rest/v1/void_records'){
   assert.equal(url.searchParams.get('user_id'),`eq.${owner}`);assert.equal(url.searchParams.get('kind'),'eq.review');assert.equal(url.searchParams.get('item_key'),'like.filmes:%');return json(rows);
  }
  if(/^\/3\/movie\/\d+$/.test(url.pathname)){recoveries++;return json({genres:[{id:878}]});}
  assert.ok(['/3/trending/movie/week','/3/discover/movie'].includes(url.pathname));
  return json({results:[{id:801,title:'Already seen',genre_ids:[878]},{id:9999,title:'New movie',genre_ids:[878]}]});
 };
 async function run(){const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};await handler({method:'GET',headers:{authorization:'Bearer fixture'}},res);assert.equal(res.headers['Cache-Control'],'private, no-store');return res;}
 const row=(id,genres)=>({item_key:`filmes:${id}`,payload:{nota:4,item:{id,genreIds:genres}}});
 rows=[row(801,[878]),row(802,[878])];let res=await run();assert.equal(res.body.insufficient,true);assert.equal(res.body.progress.qualifying,2);assert.equal(res.body.fallback,true);assert.deepEqual(res.body.movies.map(m=>m.id),[9999]);
 rows.push(row(803,[878]));res=await run();assert.equal(res.body.insufficient,undefined);assert.equal(res.body.movies[0].recommendationReason,'Gênero: Ficção científica');assert.equal(recoveries,0);
 rows=[row(801),row(802),row(803)];res=await run();assert.equal(res.body.progress.qualifying,3);assert.deepEqual(res.body.movies.map(m=>m.id),[9999]);assert.equal(recoveries,3);
});
