import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnimeDetailService,cleanAnimeSynopsis} from '../lib/anime-detail-service.js';
function memory(){const rows=new Map();return {peek:async k=>rows.get(k),get:async(k,load)=>{if(!rows.has(k))rows.set(k,await load());return rows.get(k);},rows};}
test('Portuguese TMDB synopsis wins, source boilerplate is removed, and shared detail cache prevents all repeat providers',async()=>{
 const cache=memory();let details=0,enrichments=0;
 const service=createAnimeDetailService({cache,detail:async()=>{details++;return {id:1,sinopse:'Second season.'};},enrich:async item=>{enrichments++;return {...item,synopsisTmdbPt:'Uma sinopse em português. [Written by MAL Rewrite]',synopsisScope:'series'};}});
 const a=await service.detail(1),b=await service.detail(1);assert.equal(a.synopsisLabel,'Sinopse da série');assert.equal(a.sinopse,'Uma sinopse em português.');assert.deepEqual(a,b);assert.equal(details,1);assert.equal(enrichments,1);assert.equal(cleanAnimeSynopsis('Story. (Source: Manga)'),'Story.');
});
test('a saved translation is reused even when the presentation cache is rebuilt',async()=>{
 const cache=memory();let translations=0;const service=createAnimeDetailService({cache,detail:async()=>({id:1,sinopse:'An English synopsis that is sufficiently long to be translated.'}),enrich:async x=>x,translate:async()=>{translations++;return 'Uma história traduzida.';}});
 await service.detail(1);cache.rows.delete('detail:v1:1');await service.detail(1);assert.equal(translations,1);
});
test('translation failure preserves the anime and its supplied synopsis',async()=>{const english='An English synopsis that is sufficiently long to be translated.';const service=createAnimeDetailService({cache:memory(),detail:async()=>({id:1,sinopse:english}),enrich:async x=>x,translate:async()=>{throw Error('offline');}});const item=await service.detail(1);assert.equal(item.sinopse,english);assert.equal(item.synopsisLanguage,'en');});
