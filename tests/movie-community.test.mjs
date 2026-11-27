import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendationReady, excludeReviewed, feedMovies } from '../lib/movie-community.js';
import { scopedStorage, mergeCloud, MOVIES_KEY, accountKey } from '../lib/account-storage.js';
import { recommendationCandidates } from '../lib/movie-recommendations.js';

test('recommendations require history and highly rated genres and exclude rated IDs across types', () => {
  assert.equal(recommendationReady({count:2,genres:['18']}), false);
  assert.equal(recommendationReady({count:3,genres:[]}), false);
  assert.equal(recommendationReady({count:3,genres:['18']}), true);
  assert.deepEqual(excludeReviewed([{id:1},{id:2}], ['1']), [{id:2}]);
});
test('watchlist changes queue private cloud records and tombstones without crossing accounts', () => {
  const data = new Map(); const storage = { getItem: key => data.get(key) ?? null, setItem: (key,value) => data.set(key,value) };
  const account = scopedStorage(storage,'alice');
  const movie = {id:12,categoria:'filmes',titulo:'Teste'};
  account.setItem(MOVIES_KEY,JSON.stringify({12:movie}));
  assert.deepEqual(JSON.parse(storage.getItem(accountKey('alice'))).pending['watchlist:12'].payload, {item:movie});
  assert.equal(scopedStorage(storage,'bob').getItem(MOVIES_KEY),null);
  mergeCloud(storage,'bob',[{user_id:'alice',kind:'watchlist',item_key:'12',payload:{item:movie}}]);
  assert.equal(scopedStorage(storage,'bob').getItem(MOVIES_KEY),'{}');
  mergeCloud(storage,'bob',[{user_id:'bob',kind:'watchlist',item_key:'12',payload:{item:movie}}]);
  assert.deepEqual(JSON.parse(scopedStorage(storage,'bob').getItem(MOVIES_KEY)),{12:movie});
  account.setItem(MOVIES_KEY,'{}');
  assert.equal(JSON.parse(storage.getItem(accountKey('alice'))).pending['watchlist:12'].payload,null);
});
test('community cards preserve film metadata and friend rating', () => {
  const [movie] = feedMovies([{movie:{id:1,titulo:'Teste'},display_name:'Ana',rating:4}]);
  assert.equal(movie.friend.name,'Ana');assert.equal(movie.friend.rating,4);assert.equal(movie.id,1);
});
test('TMDB recommendation candidates cache public metadata for 1h without user exclusions', async () => {
  const originalFetch = globalThis.fetch; const originalKey = process.env.TMDB_API_KEY;
  process.env.TMDB_API_KEY = 'test'; let calls = 0;
  globalThis.fetch = async input => {
    calls++; const url = new URL(input);
    assert.equal(url.searchParams.get('language'),'pt-BR');assert.equal(url.searchParams.get('region'),'BR');
    assert.equal(url.searchParams.get('include_adult'),'false');
    return {ok:true,json:async()=>({results:[{id:Number(url.searchParams.get('page')),title:'Teste',genre_ids:[18]},{id:99,adult:true}]})};
  };
  try {
    const movies = await recommendationCandidates(['18','18'],1000);
    assert.equal(movies.length,3);assert.equal(calls,3);
    await recommendationCandidates(['18'],2000);assert.equal(calls,3);
    assert.equal(excludeReviewed(movies,['1']).length,2);
    assert.equal((await recommendationCandidates(['18'],3000)).length,3);
    await recommendationCandidates(['18'],3601001);assert.equal(calls,6);
  } finally { globalThis.fetch=originalFetch;if(originalKey===undefined) delete process.env.TMDB_API_KEY;else process.env.TMDB_API_KEY=originalKey; }
});
