import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { reviewReactions,setReaction } from '../lib/reactions.js';
const sdk=fetch=>createClient('https://void.test','test-public-key',{global:{fetch},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
test('reaction aggregates match author plus work and preserve zero ratings; empty feeds make no request',async()=>{
  const calls=[],client=sdk(async(url,options)=>{calls.push(JSON.parse(options.body));return response([{review_user:'a',item_key:'filmes:1',likes:4,liked:true},{review_user:'b',item_key:'filmes:1',likes:2,liked:false}]);});
  assert.deepEqual(await reviewReactions(client,[]),[]);assert.equal(calls.length,0);
  const rows=await reviewReactions(client,[{user_id:'a',item_key:'filmes:1',rating:0},{user_id:'b',item_key:'filmes:1',rating:4.7}]);
  assert.equal(calls.length,1);assert.equal(calls[0].targets.length,2);assert.equal(rows[0].rating,0);assert.equal(rows[0].likes,4);assert.equal(rows[0].liked,true);assert.equal(rows[1].likes,2);
});
test('reaction failures preserve reviews and expose a section-local unavailable state',async()=>{
  const client=sdk(async()=>response({message:'Unavailable'},503));
  const rows=await reviewReactions(client,[{user_id:'a',item_key:'filmes:1',text:'Review'}]);
  assert.equal(rows[0].text,'Review');assert.equal(rows[0].reactionUnavailable,true);
});
test('list/review toggles use existing tables and always constrain deletes to the signed-in owner',async()=>{
  const calls=[],client=sdk(async(url,options)=>{calls.push({url:new URL(url),method:options.method,body:options.body?JSON.parse(options.body):null});return new Response(null,{status:204});});
  await setReaction(client,'owner',{listId:'list'},true);assert.deepEqual(calls[0].body,{list_id:'list',user_id:'owner'});assert.equal(calls[0].url.pathname,'/rest/v1/list_likes');
  await setReaction(client,'owner',{reviewUser:'author',itemKey:'filmes:42'},false);assert.equal(calls[1].method,'DELETE');assert.equal(calls[1].url.searchParams.get('user_id'),'eq.owner');assert.equal(calls[1].url.searchParams.get('review_user'),'eq.author');assert.equal(calls[1].url.searchParams.get('item_key'),'eq.filmes:42');
  await setReaction(client,'owner',{listId:'list'},false);assert.equal(calls[2].url.searchParams.get('list_id'),'eq.list');assert.equal(calls[2].url.searchParams.get('user_id'),'eq.owner');
});
test('duplicate inserts are idempotent, authorization/rate-limit failures remain failures',async()=>{
  await setReaction(sdk(async()=>response({code:'23505'},409)),'owner',{listId:'list'},true);
  await assert.rejects(setReaction(sdk(async()=>response({code:'42501'},403)),'owner',{listId:'list'},true));
  await assert.rejects(setReaction(sdk(async()=>response({code:'P0001',message:'RATE_LIMIT'},400)),'owner',{reviewUser:'a',itemKey:'filmes:1'},true));
});
