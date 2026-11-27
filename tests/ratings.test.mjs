import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRating, normalizeReview, tmdbDisplayRating } from '../lib/ratings.js';
import { scopedStorage, REVIEWS_KEY, readAccount, syncAccount, importGuest } from '../lib/account-storage.js';
import { validReview } from '../lib/review-detail.js';
import { isReviewed } from '../lib/franchise-model.js';
import { normalizeMovie } from '../lib/movie-catalog.js';

const store = () => { const map = new Map(); return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}; };
const item = {id:42,categoria:'filmes',titulo:'Teste'};

test('ratings accept zero, five and every tenth using comma or dot; blank and invalid precision are rejected',()=>{
  for(let n=0;n<=50;n++)assert.equal(parseRating(n/10),n/10);
  for(const [value,want]of [['3,5',3.5],['4.2',4.2],['4,4',4.4],['4,7',4.7],['0',0],['5,0',5]])assert.equal(parseRating(value),want);
  for(const value of ['',null,undefined,' ',false,-1,5.1,4.25,'4e0','4,','NaN'])assert.ok(Number.isNaN(parseRating(value)),String(value));
  const form={rating:'0',text:'',date:'2020-01-01'};
  assert.ok(validReview(form));assert.ok(validReview({...form,rating:'4,7'}));
  assert.equal(isReviewed({'filmes:42':{nota:0}},42),true);
});

test('legacy migration preserves canonical /5 and halves only explicit /10 or unambiguous scores above five once',()=>{
  for(const nota of [0,.5,2,4.2,5]){const record={nota};assert.equal(normalizeReview(record),record);}
  const old={nota:8.8,ratingScale:10,texto:'Keep',public:false,item};
  const migrated=normalizeReview(old);assert.equal(migrated.nota,4.4);assert.equal(migrated.texto,'Keep');assert.equal(migrated.public,false);
  assert.deepEqual(migrated.originalRating,{value:8.8,scale:10});assert.equal(old.nota,8.8);
  assert.deepEqual(normalizeReview(migrated),migrated);
  assert.equal(normalizeReview({nota:4,ratingScale:10}).nota,2);
  assert.equal(normalizeReview({nota:9}).nota,4.5);
  assert.equal(normalizeReview({nota:8,ratingScale:5}).nota,8); // invalid explicit /5 is never guessed
});

test('guest imports, drafts, account queue and cloud preserve decimal scores and tombstones without mixing accounts',async()=>{
  const storage=store(), guest=scopedStorage(storage,null),account=scopedStorage(storage,'a');
  guest.setItem(REVIEWS_KEY,JSON.stringify({'filmes:42':{item,nota:0},'filmes:43':{item:{...item,id:43},nota:9.4}}));
  assert.equal(importGuest(storage,'a'),2);
  assert.equal(JSON.parse(account.getItem(REVIEWS_KEY))['filmes:43'].nota,4.7);
  assert.equal(scopedStorage(storage,'b').getItem(REVIEWS_KEY),null);
  account.setItem('void:draft:filmes:42',JSON.stringify({nota:8,ratingScale:10,item}));
  assert.equal(JSON.parse(account.getItem('void:draft:filmes:42')).nota,4);
  let uploaded;
  await syncAccount({from:()=>({upsert:async rows=>{uploaded=rows;return {error:null};}})},storage,'a',false,async()=>{});
  assert.deepEqual(uploaded.map(r=>r.payload.nota).sort(),[0,4.7]);
  account.setItem(REVIEWS_KEY,'{}');
  assert.equal(readAccount(storage,'a').pending['review:filmes:42'].payload,null);
  assert.ok(guest.getItem(REVIEWS_KEY).includes('originalRating'));
});

test('TMDB original value remains separate from display and Void average, including missing votes',()=>{
  const movie=normalizeMovie({id:42,title:'Teste',vote_count:100,vote_average:9});
  assert.equal(movie.tmdbRating,9);assert.equal(movie.nota,4.5);assert.equal(tmdbDisplayRating(movie),4.5);
  const withCommunity={...movie,voidAverage:4.7};assert.equal(tmdbDisplayRating(withCommunity),4.5);
  assert.equal(normalizeMovie({id:42,vote_count:0,vote_average:0}).nota,null);
  assert.equal(tmdbDisplayRating({nota:0}),0);
});
