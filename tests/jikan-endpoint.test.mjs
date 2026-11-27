process.env.ANIME_CATALOG_PROVIDER='jikan';
import test from 'node:test';
import assert from 'node:assert/strict';
import {jikanEndpoint} from '../lib/jikan-endpoint.js';
import {animeResource} from '../lib/anime-catalog.js';
import handler from '../pages/api/animes/[section].js';
test('retired public Jikan fails immediately without a network request',async t=>{
 const previous=process.env.JIKAN_API_BASE_URL;delete process.env.JIKAN_API_BASE_URL;t.after(()=>{if(previous===undefined)delete process.env.JIKAN_API_BASE_URL;else process.env.JIKAN_API_BASE_URL=previous;});
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('NETWORK_TOUCHED');});
 for(const value of [undefined,'https://api.jikan.moe/v4/'])assert.throws(()=>jikanEndpoint(value),e=>e.code==='JIKAN_RETIRED'&&e.status===503);
 await assert.rejects(animeResource('top/anime'),e=>e.code==='JIKAN_RETIRED');assert.equal(calls,0);
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};
 await handler({method:'GET',query:{section:'editorial'}},res);assert.equal(res.code,503);assert.equal(res.data.code,'JIKAN_RETIRED');assert.match(res.data.erro,/encerrada/);assert.equal(res.headers['Cache-Control'],'no-store');assert.equal(calls,0);
});
test('operator may configure a Jikan-v4 instance without URL credentials or query strings',()=>{
 assert.equal(jikanEndpoint('https://catalog.example.invalid/v4/'),'https://catalog.example.invalid/v4');assert.equal(jikanEndpoint('http://localhost:8080/v4'),'http://localhost:8080/v4');
 for(const url of ['not a URL','ftp://example.invalid/v4','http://example.invalid/v4','https://user:secret@example.invalid/v4','https://example.invalid/v4?token=secret','https://example.invalid/v4#fragment'])assert.throws(()=>jikanEndpoint(url),/CONFIG/);
});
