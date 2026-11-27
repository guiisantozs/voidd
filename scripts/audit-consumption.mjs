import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {fetchJson} from '../lib/api.js';
import {createProviderGuard} from '../lib/provider-guard.js';
import {createRefreshQueue} from '../lib/refresh-queue.js';

const original=globalThis.fetch;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
let calls=0,release;
try {
 const wait=new Promise(resolve=>{release=resolve;});
 globalThis.fetch=async()=>{calls++;await wait;return {ok:true,json:async()=>({results:[]})};};
 const reads=Array.from({length:20},()=>fetchJson('https://api.themoviedb.org/3/movie/1000001?language=pt-BR'));
 await tick();release();await Promise.all(reads);assert.equal(calls,1);
 let peak=0,active=0;
 const guard=createProviderGuard({concurrency:6});
 await Promise.all(Array.from({length:20},(_,i)=>guard.run(String(i),async()=>{active++;peak=Math.max(peak,active);await tick();active--;})));
 assert.equal(peak,6);
 let limitedCalls=0;
 const blocked=createProviderGuard({concurrency:1});
 await Promise.allSettled(Array.from({length:20},(_,i)=>blocked.run(String(i),async()=>{limitedCalls++;throw Object.assign(Error('fixture'),{status:429,retryAfter:30});})));
 assert.equal(limitedCalls,1);
 let refreshCalls=0,done;
 const refreshing=new Promise(resolve=>{done=resolve;});
 const queue=createRefreshQueue(async()=>{refreshCalls++;await refreshing;});
 const updates=Array.from({length:20},()=>queue.refresh());done();await Promise.all(updates);assert.equal(refreshCalls,1);
 const report={scope:'Controlled mocks; not production traffic or provider billing',results:{identicalConcurrentPublicGets:{requests:20,upstreamCalls:calls},distinctPublicGets:{requests:20,peakConcurrency:peak},queuedRequestsDuring429:{requests:20,upstreamCalls:limitedCalls},simultaneousMountedRefreshes:{requests:20,readBatches:refreshCalls}}};
 await writeFile(new URL('../docs/CONSUMPTION_RESULTS.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
} finally {globalThis.fetch=original;}
