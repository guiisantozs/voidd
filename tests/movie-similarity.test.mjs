import test from 'node:test';
import assert from 'node:assert/strict';
import {movieRelationship} from '../lib/movie-similarity.js';
import {getSimilarMovies,clearDetailCache} from '../lib/movie-detail.js';
const keyword=(id,name)=>({id,name});
const movie=(id,genre_ids,keywords=[],extra={})=>({id,title:`Filme ${id}`,genre_ids,keywords:{keywords},...extra});
const seed=movie(1,[28,12,878],[keyword(10,'superhero'),keyword(11,'marvel cinematic universe (mcu)'),keyword(12,'alien invasion')],{belongs_to_collection:{id:50},credits:{crew:[{id:8,job:'Director'}],cast:[{id:9},{id:10}]} });

test('relationships prioritize collection, narrative universe, character and actual themes',()=>{
 assert.equal(movieRelationship(seed,movie(2,[28],[],{belongs_to_collection:{id:50}})).tier,1);
 assert.equal(movieRelationship(seed,movie(3,[28],[keyword(11,'marvel cinematic universe (mcu)')])).tier,2);
 assert.equal(movieRelationship(seed,movie(4,[28]),{character:true}).tier,3);
 assert.equal(movieRelationship(seed,movie(5,[28,878],[keyword(10,'superhero')])).tier,4);
 assert.equal(movieRelationship(seed,movie(6,[28,878],[],{credits:{crew:[{id:8,job:'Director'}]}})).tier,5);
});
test('genres, popularity and studio alone never qualify; broad tags do not create thematic matches',()=>{
 assert.equal(movieRelationship(seed,movie(2,[28,12,878],[],{popularity:999999,production_companies:[{id:5}]})),null);
 const drama=movie(1,[18],[keyword(1,'based on novel'),keyword(2,'friendship')],{production_companies:[{id:5}]});
 assert.equal(movieRelationship(drama,movie(2,[18],[keyword(1,'based on novel'),keyword(2,'friendship')],{production_companies:[{id:5}]})),null);
 assert.equal(movieRelationship(seed,{...seed}),null);assert.equal(movieRelationship(seed,{...seed,id:2,adult:true}),null);
 assert.equal(movieRelationship(seed,movie(2,[99]),{character:true}),null);
});
test('horror, romance, animation, science fiction and action require concrete themes',()=>{
 for(const [genres,terms] of [[[27,53],['demonic possession','haunted house']],[[18,10749],['forbidden love','love triangle']],[[16,14],['magic','fairy tale']],[[878,12],['space exploration','black hole']],[[28,53],['martial arts','espionage']]]){
  const keys=terms.map((name,i)=>keyword(i+1,name)),a=movie(1,genres,keys),b=movie(2,genres,keys);
  assert.equal(movieRelationship(a,b).tier,4);assert.equal(movieRelationship(a,movie(3,genres)),null);
 }
 const animated=movie(1,[16,14],[keyword(1,'magic'),keyword(2,'fairy tale')]);
 assert.equal(movieRelationship(animated,movie(2,[14],[keyword(1,'magic'),keyword(2,'fairy tale')])),null);
});

test('related selection unions sources, validates generic candidates, preserves API images and caches all pages',async t=>{
 const original=globalThis.fetch,key=process.env.TMDB_API_KEY;process.env.TMDB_API_KEY='test';clearDetailCache();let calls=0;
 t.after(()=>{globalThis.fetch=original;if(key===undefined)delete process.env.TMDB_API_KEY;else process.env.TMDB_API_KEY=key;clearDetailCache();});
 globalThis.fetch=async input=>{
  calls++;const url=new URL(input),path=url.pathname;
  let data;
  if(path==='/3/movie/1')data={...seed,original_title:'Spider-Man: Test',recommendations:{results:[{id:3},{id:99}]},similar:{results:[{id:99}]}};
  else if(path==='/3/collection/50')data={parts:[seed,movie(2,[28],[],{poster_path:'/original.jpg',release_date:'2005-01-01'}),movie(2,[28])]};
  else if(path==='/3/search/movie')data={results:[movie(4,[28],[],{original_title:'The Amazing Spider-Man'})]};
  else if(path==='/3/movie/3')data=movie(3,[28,878],[keyword(11,'marvel cinematic universe (mcu)')]);
  else if(path==='/3/movie/99')data=movie(99,[28,12,878],[],{popularity:999999});
  else if(path==='/3/discover/movie')data={results:[movie(5,[28,878]),movie(1,[28])]};
  else throw Error('Unexpected API request');
  return {ok:true,json:async()=>data};
 };
 const [a,b]=await Promise.all([getSimilarMovies('1'),getSimilarMovies('1')]);
 assert.equal(a.movies[0].id,2);assert.match(a.movies[0].poster,/original\.jpg$/);assert.equal(new Set(a.movies.map(m=>m.id)).size,a.movies.length);assert.ok(!a.movies.some(m=>m.id===1||m.id===99));assert.deepEqual(a,b);
 const before=calls;const next=await getSimilarMovies('1',2);assert.equal(calls,before);assert.equal(next.movies.length,0);assert.equal(next.totalPages,1);
 assert.ok(a.movies.find(m=>m.id===3).similarity.tier<a.movies.find(m=>m.id===4).similarity.tier);
});

test('optional recommendation failures retain the collection instead of adding unrelated fillers',async t=>{
 const original=globalThis.fetch,key=process.env.TMDB_API_KEY;process.env.TMDB_API_KEY='test';clearDetailCache();
 t.after(()=>{globalThis.fetch=original;if(key===undefined)delete process.env.TMDB_API_KEY;else process.env.TMDB_API_KEY=key;clearDetailCache();});
 globalThis.fetch=async input=>{const path=new URL(input).pathname;if(path==='/3/movie/1')return {ok:true,json:async()=>({...seed,recommendations:{results:[{id:99}]}})};if(path==='/3/collection/50')return {ok:true,json:async()=>({parts:[movie(2,[28])]})};throw Error('offline');};
 const result=await getSimilarMovies('1');assert.deepEqual(result.movies.map(m=>m.id),[2]);assert.equal(result.partial,true);
});

test('nearby sequels precede distant collection entries regardless of extra genres or keyword score',async t=>{
 const original=globalThis.fetch,key=process.env.TMDB_API_KEY;process.env.TMDB_API_KEY='test';clearDetailCache();
 t.after(()=>{globalThis.fetch=original;if(key===undefined)delete process.env.TMDB_API_KEY;else process.env.TMDB_API_KEY=key;clearDetailCache();});
 const root=movie(1,[12,14],[],{release_date:'2000-01-01',belongs_to_collection:{id:50}});
 globalThis.fetch=async input=>({ok:true,json:async()=>new URL(input).pathname==='/3/movie/1'?root:{parts:[root,movie(2,[12,14],[],{release_date:'2008-01-01'}),movie(3,[12],[],{release_date:'2002-01-01'})]}});
 assert.deepEqual((await getSimilarMovies('1')).movies.map(m=>m.id),[3,2]);
});
test('dominant space themes exclude unrelated subgenres, live-action/animation mismatches and sparse thematic matches',()=>{
 const root=movie(1,[878,12,18],[keyword(1,'space exploration'),keyword(2,'black hole'),keyword(3,'artificial intelligence')]);
 assert.equal(movieRelationship(root,movie(2,[878,12],[keyword(3,'artificial intelligence'),keyword(4,'robot')],{vote_count:2000})),null);
 for(const extraGenre of [35,10751,16])assert.equal(movieRelationship(root,movie(2,[878,12,extraGenre],[keyword(1,'space exploration'),keyword(2,'black hole')])),null);
 assert.equal(movieRelationship(root,movie(2,[878,12],[keyword(1,'space exploration'),keyword(2,'black hole')],{vote_count:1})),null);
});
