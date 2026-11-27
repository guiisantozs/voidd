import test from 'node:test';
import assert from 'node:assert/strict';
import {wantedGames,gameWishlist} from '../lib/game-wishlist.js';
import {setGameStatus,readLibrary} from '../lib/library.js';
import {scopedStorage,readAccount} from '../lib/account-storage.js';

const item=id=>({id,categoria:'jogos',titulo:`Jogo ${id}`});
test('default wishlist derives only want entries without altering other library statuses',()=>{
  const entries={1:{item:item(1),status:'want',atualizadoEm:'2026-10-01'},2:{item:item(2),status:'playing'},3:{item:item(3),status:'finished'},4:{item:item(4),status:'want',atualizadoEm:'2026-10-02'}};
  const before=JSON.stringify(entries);
  assert.deepEqual(wantedGames(entries).map(game=>game.id),[4,1]);
  assert.equal(gameWishlist(entries).visibility,'private');
  assert.equal(gameWishlist(entries).item_count,2);
  assert.equal(JSON.stringify(entries),before);
});
test('wishlist uses existing account library and queues removals without touching visitors or other accounts',()=>{
  const data=new Map(),storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
  setGameStatus(scopedStorage(storage,null),item(9),'want');
  const a=scopedStorage(storage,'account-a'),b=scopedStorage(storage,'account-b');
  setGameStatus(a,item(1),'want');setGameStatus(a,item(2),'playing');setGameStatus(b,item(3),'want');
  assert.deepEqual(wantedGames(readLibrary(a)).map(game=>game.id),[1]);
  setGameStatus(a,item(1),'');
  assert.equal(readAccount(storage,'account-a').pending['library:1'].payload,null);
  assert.equal(readLibrary(a)[2].status,'playing');
  assert.deepEqual(wantedGames(readLibrary(b)).map(game=>game.id),[3]);
  assert.deepEqual(wantedGames(readLibrary(scopedStorage(storage,null))).map(game=>game.id),[9]);
});
