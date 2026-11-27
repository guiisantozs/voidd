import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMovieSearch } from '../lib/movie-search-options.js';
import { searchMovies,clearMovieSearchCache } from '../lib/movie-search.js';
import handler from '../pages/api/movie-search.js';
function setup(t) {
  const fetch=globalThis.fetch,key=process.env.TMDB_API_KEY;process.env.TMDB_API_KEY='test';clearMovieSearchCache();
  t.after(()=>{globalThis.fetch=fetch;clearMovieSearchCache();if(key===undefined) delete process.env.TMDB_API_KEY;else process.env.TMDB_API_KEY=key;});
}
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
test('movie search rejects malformed cursors, repeated query params and invalid genres/years',()=>{
  for(const input of [{q:['a','b']},{q:'a'.repeat(101)},{genre:'999'},{year:'1800'},{year:'2026 OR 1=1'},{cursor:'501:0'},{cursor:'1:20'},{cursor:'https://example.test'}]) assert.throws(()=>parseMovieSearch(input),/INVALID/);
  assert.equal(parseMovieSearch({q:' Duna '}).q,'Duna');
});
test('title search sends BR/pt-BR/year, filters genres on server and resumes without skipping matches',async t=>{
  setup(t);let calls=0;
  globalThis.fetch=async input=>{calls++;const url=new URL(input);assert.equal(url.pathname,'/3/search/movie');assert.equal(url.searchParams.get('language'),'pt-BR');assert.equal(url.searchParams.get('region'),'BR');assert.equal(url.searchParams.get('primary_release_year'),'2020');assert.equal(url.searchParams.get('query'),'Duna');assert.equal(url.searchParams.has('with_genres'),false);
    const page=+url.searchParams.get('page');return {ok:true,json:async()=>({total_pages:2,results:Array.from({length:20},(_,index)=>({id:(page-1)*20+index+1,title:'Filme',genre_ids:page===1&&index<5?[18]:[878],vote_average:8,vote_count:10}))})};};
  const options={q:'Duna',genre:'878',year:'2020'};
  const first=await searchMovies(parseMovieSearch(options),0);assert.equal(first.movies.length,20);assert.equal(first.next,'2:5');assert.equal(first.movies[0].id,6);assert.equal(first.movies[0].nota,4);
  const second=await searchMovies(parseMovieSearch({...options,cursor:first.next}),100);assert.equal(second.movies.length,15);assert.equal(second.movies[0].id,26);assert.equal(second.next,null);assert.equal(calls,2);
  assert.equal(new Set([...first.movies,...second.movies].map(movie=>movie.id)).size,35);
});
test('sparse genre filtering bounds work and does not incorrectly claim the end of results',async t=>{
  setup(t);let calls=0;globalThis.fetch=async()=>{calls++;return {ok:true,json:async()=>({total_pages:50,results:Array.from({length:20},(_,id)=>({id,genre_ids:[18]}))})};};
  const data=await searchMovies(parseMovieSearch({q:'ab',genre:'27'}));assert.deepEqual(data.movies,[]);assert.equal(data.next,'4:0');assert.equal(calls,3);
});
test('discover uses genre filters and cache expires after five minutes',async t=>{
  setup(t);let calls=0;globalThis.fetch=async input=>{calls++;const url=new URL(input);assert.equal(url.pathname,'/3/discover/movie');assert.equal(url.searchParams.get('with_genres'),'18');assert.equal(url.searchParams.get('include_adult'),'false');return {ok:true,json:async()=>({total_pages:1,results:[{id:1,title:'Drama',genre_ids:[18]},{id:2,adult:true,genre_ids:[18]}]})};};
  const options=parseMovieSearch({genre:'18'});assert.equal((await searchMovies(options,0)).movies.length,1);await searchMovies(options,299999);assert.equal(calls,1);await searchMovies(options,300000);assert.equal(calls,2);
});
test('search route validates before fetching and never caches upstream errors or leaks key',async t=>{
  setup(t);let calls=0;globalThis.fetch=async()=>{calls++;throw Error('secret-upstream-url');};
  const invalid=response();await handler({method:'GET',query:{cursor:'bad'}},invalid);assert.equal(invalid.code,400);assert.equal(calls,0);
  const denied=response();await handler({method:'POST'},denied);assert.equal(denied.code,405);
  const failure=response();await handler({method:'GET',query:{q:'Duna'}},failure);assert.equal(failure.code,502);assert.equal(failure.headers['Cache-Control'],undefined);assert.ok(!JSON.stringify(failure.body).includes('secret-upstream-url'));
});
