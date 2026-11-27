import test from 'node:test';
import assert from 'node:assert/strict';
import {createProviderGuard,createSearchLimiter,retryAfterSeconds} from '../lib/provider-guard.js';
import {createRefreshQueue} from '../lib/refresh-queue.js';
import {fetchJson,catalogHandler} from '../lib/api.js';
import {allowCatalogSearch,consumptionFailure} from '../lib/catalog-consumption.js';
import {createIGDBClient} from '../lib/igdb-client.js';

const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {resolve,promise};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('public upstream transport coalesces identical reads and bounds distinct concurrent requests',async()=>{
 const wait=deferred(),events=[];let calls=0,active=0,peak=0;
 const guard=createProviderGuard({concurrency:2,maxQueue:2,record:e=>events.push(e)});
 const load=async()=>{calls++;active++;peak=Math.max(peak,active);await wait.promise;active--;return {ok:true};};
 const a=guard.run('a',load),same=guard.run('a',load),b=guard.run('b',load),c=guard.run('c',load),d=guard.run('d',load);
 assert.equal(a,same);await assert.rejects(guard.run('e',load),e=>e.status===503);await tick();assert.equal(calls,2);
 wait.resolve();await Promise.all([a,same,b,c,d]);assert.equal(calls,4);assert.equal(peak,2);assert(events.includes('deduplicated'));
});
test('429 waits honor Retry-After and queued requests do not continue hitting a blocked provider',async()=>{
 let now=0,calls=0;const guard=createProviderGuard({concurrency:1,clock:()=>now});
 const load=async()=>{calls++;throw Object.assign(Error('limited'),{status:429,retryAfter:20});};
 const results=await Promise.allSettled([guard.run('a',load),guard.run('b',load)]);
 assert.equal(calls,1);assert(results.every(result=>result.reason.status===429));
 now=19000;await assert.rejects(guard.run('c',load),e=>e.retryAfter===1);assert.equal(calls,1);
 now=20001;assert.equal(await guard.run('c',async()=>42),42);
});
test('consecutive failures open a short circuit; process budgets reset only at their own boundary',async()=>{
 let now=0,calls=0;const guard=createProviderGuard({clock:()=>now,failureThreshold:2,cooldownMs:30000});
 const fail=async()=>{calls++;throw Object.assign(Error('upstream'),{status:502});};
 await assert.rejects(guard.run('a',fail));await assert.rejects(guard.run('b',fail));
 await assert.rejects(guard.run('c',fail),e=>e.status===429);assert.equal(calls,2);
 now=30001;assert.equal(await guard.run('d',async()=>1),1);
 const budget=createProviderGuard({clock:()=>now,minuteBudget:1,dailyBudget:2});
 await budget.run('a',async()=>1);await assert.rejects(budget.run('b',async()=>1),e=>e.status===429);
 now=60001;await budget.run('b',async()=>1);now=120001;
 await assert.rejects(budget.run('c',async()=>1),e=>e.retryAfter>80000);
 now=86400001;await budget.run('c',async()=>1);
});
test('Retry-After accepts HTTP dates and seconds, with a safe malformed-header fallback',()=>{
 assert.equal(retryAfterSeconds('2.5',0),3);assert.equal(retryAfterSeconds('Thu, 01 Jan 1970 00:00:20 GMT',0),20);
 assert.equal(retryAfterSeconds('garbage',0),60);assert.equal(retryAfterSeconds(null,0),60);
});
test('search limiter refills gradually, bounds identity storage, and does not evict active limits',()=>{
 let now=0;const allow=createSearchLimiter({limit:2,maxClients:1,clock:()=>now});
 assert.equal(allow('a'),0);assert.equal(allow('a'),0);assert.equal(allow('a'),30);assert.equal(allow('b'),60);
 now=30000;assert.equal(allow('a'),0);assert.equal(allow('a'),30);now=90001;assert.equal(allow('b'),0);
});
test('direct-server search limits cannot be bypassed by changing X-Forwarded-For',()=>{
 const response={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(){}};
 let allowed=0;for(let i=0;i<100;i++)if(allowCatalogSearch({socket:{remoteAddress:'192.0.2.81'},headers:{'x-forwarded-for':`192.0.2.${i}`}},response))allowed++;
 assert.equal(allowed,90);assert.equal(response.code,429);assert.equal(response.headers['Cache-Control'],'no-store');assert(Number(response.headers['Retry-After'])>0);
});
test('actual public JSON helper shares upstream GET and returns independent copies',async t=>{
 const wait=deferred();let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;await wait.promise;return {ok:true,json:async()=>({results:[{id:1}]})};});
 const a=fetchJson('https://api.themoviedb.org/3/movie/1234567'),b=fetchJson('https://api.themoviedb.org/3/movie/1234567');
 await tick();assert.equal(calls,1);wait.resolve();const [first,second]=await Promise.all([a,b]);first.results[0].id=2;assert.equal(second.results[0].id,1);
});
test('API propagates cooldowns without caching errors or exposing provider diagnostics',async()=>{
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(value){this.body=value;}};
 await catalogHandler('filmes',async()=>{throw Object.assign(Error('secret'),{status:429,retryAfter:15});})({method:'GET'},res);
 assert.equal(res.code,429);assert.equal(res.headers['Retry-After'],'15');assert.equal(res.headers['Cache-Control'],'no-store');assert(!JSON.stringify(res.body).includes('secret'));
 assert.equal(consumptionFailure(Error('other'),res),null);
});
test('mounted refresh queue joins bursts, preserves a mutation during reads, and never overlaps queries',async()=>{
 const gates=[deferred(),deferred()];let calls=0,active=0,peak=0;
 const queue=createRefreshQueue(async()=>{const index=calls++;active++;peak=Math.max(peak,active);await gates[index].promise;active--;});
 const initial=queue.refresh();for(let i=0;i<20;i++)assert.equal(queue.refresh(),initial);
 queue.refresh({changed:true});queue.refresh({changed:true});assert.equal(calls,1);gates[0].resolve();await tick();assert.equal(calls,2);
 gates[1].resolve();await initial;assert.equal(peak,1);queue.dispose();await queue.refresh({changed:true});assert.equal(calls,2);
});
test('discarding an account cancels trailing work even when the old response resolves later',async()=>{
 const wait=deferred();let oldCalls=0,newCalls=0;
 const old=createRefreshQueue(async()=>{oldCalls++;await wait.promise;}),next=createRefreshQueue(async()=>{newCalls++;});
 const pending=old.refresh();old.refresh({changed:true});old.dispose();await next.refresh();wait.resolve();await pending;
 assert.equal(oldCalls,1);assert.equal(newCalls,1);
});
test('IGDB keeps its serialized transport and stops queued requests after repeated server errors',async()=>{
 let requests=0;
 const client=createIGDBClient({interval:0,credentials:()=>({id:'fixture',secret:'fixture'}),fetcher:async url=>{
  if(String(url).includes('oauth2/token'))return {ok:true,json:async()=>({access_token:'fixture',expires_in:3600})};
  requests++;return {ok:false,status:502};
 }});
 const results=await Promise.allSettled(Array.from({length:12},(_,i)=>client('games',`fields id; where id=${i+1};`)));
 assert.equal(requests,5);assert.equal(results.filter(row=>row.reason.status===429).length,7);
});
