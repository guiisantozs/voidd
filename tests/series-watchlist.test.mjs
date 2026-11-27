import test from 'node:test';
import assert from 'node:assert/strict';
import {readWatchlist,setWatchlistItem,SERIES_LIST_KEY,MOVIE_LIST_KEY} from '../lib/movie-watchlist.js';
import {scopedStorage,readAccount,mergeCloud,syncAccount,importGuest} from '../lib/account-storage.js';
const store=()=>{const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};};
const series={id:42,categoria:'series',titulo:'Série',poster:'https://image.tmdb.org/t/p/w500/fixture.jpg'};
test('series watchlist is idempotent and independent from film IDs, guests and other accounts',()=>{
 const storage=store(),owner=scopedStorage(storage,'one'),other=scopedStorage(storage,'two');
 setWatchlistItem(scopedStorage(storage,null),series,true);
 setWatchlistItem(owner,{...series,categoria:'filmes'},true);
 setWatchlistItem(owner,series,true);setWatchlistItem(owner,series,true);
 assert.equal(Object.keys(readWatchlist(owner,'series')).length,1);
 assert.equal(Object.keys(readWatchlist(owner)).length,1);
 assert.deepEqual(readWatchlist(other,'series'),{});
 assert.equal(readAccount(storage,'one').pending['series_watchlist:42'].payload.item.categoria,'series');
 setWatchlistItem(owner,series,false);
 assert.equal(readAccount(storage,'one').pending['series_watchlist:42'].payload,null);
 assert.equal(Object.keys(readWatchlist(owner)).length,1);
 assert.equal(Object.keys(readWatchlist(scopedStorage(storage,null),'series')).length,1);
 setWatchlistItem(owner,{...series,categoria:'animes'},true);assert.equal(Object.keys(readWatchlist(owner,'animes')).length,1);assert.equal(Object.keys(readWatchlist(owner,'series')).length,0);
 storage.setItem(SERIES_LIST_KEY,'{');assert.throws(()=>setWatchlistItem(storage,series,true));assert.equal(storage.getItem(SERIES_LIST_KEY),'{');
});
test('series watchlist survives upload/download, tombstones, concurrent edits and offline errors',async()=>{
 const storage=store(),owner=scopedStorage(storage,'one');setWatchlistItem(owner,series,true);
 const sent=[];const client={from:()=>({upsert:async rows=>{sent.push(...rows);return {error:null};}})};
 await syncAccount(client,storage,'one');assert.equal(sent[0].kind,'series_watchlist');assert.equal(Object.keys(readAccount(storage,'one').pending).length,0);
 const fresh=store();mergeCloud(fresh,'one',sent);assert.equal(readWatchlist(scopedStorage(fresh,'one'),'series')[42].titulo,'Série');
 setWatchlistItem(owner,series,false);mergeCloud(storage,'one',sent);assert.equal(readWatchlist(owner,'series')[42],undefined);
 await assert.rejects(syncAccount({from:()=>({upsert:async()=>({error:Error('offline')})})},storage,'one'));
 assert.equal(readAccount(storage,'one').pending['series_watchlist:42'].payload,null);
 const copy=store();mergeCloud(copy,'one',[...sent,{user_id:'one',kind:'series_watchlist',item_key:'42',payload:null},{user_id:'two',kind:'series_watchlist',item_key:'99',payload:{item:{...series,id:99}}}]);assert.deepEqual(readWatchlist(scopedStorage(copy,'one'),'series'),{});
});
test('explicit guest import preserves separate film/series lists and never overwrites an account',()=>{
 const storage=store();setWatchlistItem(storage,series,true);setWatchlistItem(storage,{...series,categoria:'filmes'},true);
 assert.equal(importGuest(storage,'one'),2);assert.equal(importGuest(storage,'one'),0);
 const scoped=scopedStorage(storage,'one');assert.ok(scoped.getItem(MOVIE_LIST_KEY));assert.ok(scoped.getItem(SERIES_LIST_KEY));
});
