import test from 'node:test';
import assert from 'node:assert/strict';
import {movieSaveDestination} from '../lib/movie-save-destination.js';

test('guest keeps the original local watchlist without fetching lists',async()=>{
 assert.equal(await movieSaveDestination({rpc(){throw Error('Unexpected query');}},null),'watchlist');
});
test('only the default list saves directly; any custom list opens choices including later pages',async()=>{
 for(const [data,expected] of [[{rows:[],has_more:false},'watchlist'],[{rows:[{id:'custom'}],has_more:false},'picker'],[{rows:[],has_more:true},'picker']]){
  assert.equal(await movieSaveDestination({rpc:async(name,args)=>{assert.equal(name,'void_lists_page_v2');assert.equal(args.section,'mine');assert.equal(args.media_filter,null);return {data};}},'owner'),expected);
 }
});
test('a failed list query never silently saves into the wrong destination; abort is forwarded',async()=>{
 const abort=new AbortController();let signal;
 const client={rpc:()=>({abortSignal(value){signal=value;return Promise.resolve({error:new Error('offline')});}})};
 await assert.rejects(movieSaveDestination(client,'owner',abort.signal),/offline/);assert.equal(signal,abort.signal);
});
