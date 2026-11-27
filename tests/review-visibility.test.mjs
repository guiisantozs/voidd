import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewIsPublic } from '../lib/review-detail.js';
import { REVIEWS_KEY, scopedStorage, syncAccount } from '../lib/account-storage.js';

test('new signed-in reviews default to public; existing private reviews and drafts keep their saved choice',()=>{
  assert.equal(reviewIsPublic(null,true),true);
  assert.equal(reviewIsPublic(undefined,true),true);
  for(const record of [{public:false},{nota:4.2},{public:'true'}])assert.equal(reviewIsPublic(record,true),false);
  assert.equal(reviewIsPublic({public:true},true),true);
  const draft={nota:4.7,public:false};
  assert.equal(reviewIsPublic(draft,true),false);assert.equal(draft.public,false);
});

test('visitor reviews stay local/private even when a stored record has a public flag',()=>{
  for(const record of [undefined,null,{public:true},{public:false}])assert.equal(reviewIsPublic(record,false),false);
});

test('sync preserves explicit public/private choices and author identity comes from the account',async()=>{
  const map=new Map(),storage={getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};
  const owner='account-a',scoped=scopedStorage(storage,owner);
  const publicReview={nota:4.2,item:{id:1,categoria:'filmes',titulo:'Filme'},public:reviewIsPublic(null,true)};
  const privateReview={nota:3.5,item:{id:2,categoria:'jogos',titulo:'Jogo'},public:false};
  scoped.setItem(REVIEWS_KEY,JSON.stringify({'filmes:1':publicReview,'jogos:2':privateReview}));
  const writes=[];
  const client={from(table){assert.equal(table,'void_records');return {async upsert(rows){writes.push(...rows);return {error:null};}};}};
  await syncAccount(client,storage,owner,false,async()=>{});
  assert.equal(writes.length,2);assert.ok(writes.every(row=>row.user_id===owner));
  assert.equal(writes.find(row=>row.item_key==='filmes:1').payload.public,true);
  assert.equal(writes.find(row=>row.item_key==='jogos:2').payload.public,false);
});
