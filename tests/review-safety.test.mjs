import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseDay, validReleaseDate, movieReleaseAllowed } from '../lib/movie-release.js';
import { prepareMovieReview } from '../lib/movie-release-client.js';
import { syncAccount, scopedStorage, REVIEWS_KEY, MOVIES_KEY, readAccount } from '../lib/account-storage.js';
import { openReviewShare, takeShareRequest } from '../lib/review-share-client.js';

test('official date uses São Paulo midnight and rejects unknown/invalid dates', () => {
 const movie={categoria:'filmes',estreia:'2026-10-22'};
 assert.equal(releaseDay(new Date('2026-10-22T02:59:59Z')),'2026-10-21');
 assert.equal(movieReleaseAllowed(movie,new Date('2026-10-22T02:59:59Z')),false);
 assert.equal(movieReleaseAllowed(movie,new Date('2026-10-22T03:00:00Z')),true);
 assert.equal(movieReleaseAllowed({categoria:'filmes'}),false);
 assert.equal(movieReleaseAllowed({categoria:'filmes',releaseStatus:'Released'}),true);
 assert.equal(validReleaseDate('2026-02-30'),false);
 assert.equal(movieReleaseAllowed({categoria:'jogos'}),true);
});

test('server release check binds to current session and sends no client date', async () => {
 const original=globalThis.fetch;
 const client={auth:{getSession:async()=>({data:{session:{user:{id:'a'},access_token:'fixture'}},error:null})}};
 try {
  globalThis.fetch=async(url,options)=>{assert.equal(url,'/api/movie-release');assert.deepEqual(JSON.parse(options.body),{id:'42'});return {ok:false,json:async()=>({erro:'Ainda não lançado.'})};};
  await assert.rejects(prepareMovieReview(client,'42','a'),error=>error.code==='MOVIE_RELEASE');
  await assert.rejects(prepareMovieReview(client,'42','b'),/RELEASE_AUTH/);
 }finally{globalThis.fetch=original;}
});

test('rejected movie review stays pending without preventing watchlist synchronization', async () => {
 const map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 const account=scopedStorage(storage,'a'),movie={id:42,categoria:'filmes',titulo:'Future'};
 account.setItem(REVIEWS_KEY,JSON.stringify({'filmes:42':{item:movie,nota:4}}));
 account.setItem(MOVIES_KEY,JSON.stringify({42:movie}));
 let rows;
 const client={from:()=>({upsert:async value=>{rows=value;return {error:null};}})};
 await assert.rejects(syncAccount(client,storage,'a',false,async()=>{throw Error('not released');}),/not released/);
 assert.equal(rows.length,1);assert.equal(rows[0].kind,'watchlist');
 assert.deepEqual(Object.keys(readAccount(storage,'a').pending),['review:filmes:42']);
});

test('automatic sharing is ignored even if an old preference enabled it', async () => {
 const original=globalThis.window;
 try{globalThis.window={dispatchEvent(){throw Error('unexpected dialog');}};openReviewShare('fixture',{automatic:true});assert.equal(takeShareRequest(),null);}
 finally{globalThis.window=original;}
});
