import test from 'node:test';
import assert from 'node:assert/strict';
import { groupFriendMovies, loadFriendMovieCards } from '../lib/friend-movie-cards.js';

test('one card per film, latest first, unique people and canonical 0..5 mean', () => {
 const movies=[{id:1,titulo:'One'},{id:2,titulo:'Two'},{id:1,titulo:'One'}];
 const reviews=[{item_key:'filmes:1',user_id:'a',rating:0,updated_at:'2026-10-22T10:00:00Z'},
 {item_key:'filmes:1',user_id:'b',rating:5,updated_at:'2026-10-22T11:00:00Z'},
 {item_key:'filmes:1',user_id:'b',rating:1,updated_at:'2026-10-21T11:00:00Z'},
 {item_key:'filmes:2',user_id:'c',rating:4.2,updated_at:'2026-10-22T12:00:00Z'}];
 const before=JSON.stringify(reviews),cards=groupFriendMovies(movies,reviews);
 assert.deepEqual(cards.map(c=>c.id),[2,1]);assert.equal(cards[1].friendAverage,2.5);
 assert.equal(cards[1].friends.length,2);assert.equal(cards[0].friendAverage,4.2);
 assert.equal(JSON.stringify(reviews),before);
 assert.deepEqual(groupFriendMovies([{id:3}],reviews),[]);
});

test('supplementary read uses existing friends-only RPC, paginates and batches identities', async () => {
 const calls=[];
 const client={async rpc(name,args){calls.push({name,args});
  if(name==='void_identities')return {data:args.ids.map(user_id=>({user_id,username:user_id,display_name:'Friend'}))};
  assert.equal(name,'void_movie_review_page_v2');assert.equal(args.friends_only,true);
  const rows=Array.from({length:21},(_,i)=>({user_id:'p'+i,rating:4,text:'Review',updated_at:new Date(Date.UTC(2026,9,22,0,0,30-i)).toISOString()}));
  return {data:{reviews:rows.slice(args.page_offset,args.page_offset+20),total:21}};
 }};
 const cards=await loadFriendMovieCards(client,[{id:1},{id:1}]);
 assert.equal(cards.length,1);assert.equal(cards[0].friends.length,21);assert.equal(cards[0].friendAverage,4);
 assert.deepEqual(calls.filter(c=>c.name==='void_movie_review_page_v2').map(c=>c.args.page_offset),[0,20]);
 assert.equal(calls.filter(c=>c.name==='void_identities').length,1);
 assert.equal(cards[0].friends[0].username,'p0');
});

test('revoked/hidden reviews yield no card; read errors remain failures', async () => {
 assert.deepEqual(await loadFriendMovieCards({rpc:async()=>({data:{reviews:[],total:0}})},[{id:1}]),[]);
 await assert.rejects(loadFriendMovieCards({rpc:async()=>({error:Error('unavailable')})},[{id:1}]),/unavailable/);
});
test('leaving the page aborts the friends query and prevents later pagination', async()=>{
 const controller=new AbortController();let calls=0;
 const client={rpc(){calls++;return {abortSignal(signal){assert.equal(signal,controller.signal);controller.abort();return Promise.resolve({data:{reviews:[{user_id:'a'}],total:21}});}};}};
 await assert.rejects(loadFriendMovieCards(client,[{id:1}],controller.signal),error=>error.name==='AbortError');assert.equal(calls,1);
});
