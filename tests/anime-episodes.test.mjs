import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnimeEpisodes} from '../lib/anime-episodes.js';
import {nextAnimeBroadcast} from '../lib/anime-detail-model.js';
import {writeAnimeEpisodeBatch} from '../lib/series-unit-server.js';
test('two UI pages of 25 reuse one provider page of 50; completed anime retains the long TTL',async()=>{
 const resources=new Map(),rows=new Map();let calls=0;const cache={peek:async()=>null,get:async(k,load,{ttl}={})=>{if(!rows.has(k)){const d=await load();rows.set(k,d);assert.equal(ttl(d),60*86400000);}return rows.get(k);}};
 const episodes=createAnimeEpisodes({cache,detail:async()=>({id:9000000001,format:'TV',releaseStatus:'Ended'}),resource:async(path,params)=>{if(!resources.has(params.page)){calls++;resources.set(params.page,{data:Array.from({length:50},(_,i)=>({mal_id:(params.page-1)*50+i+1,title:'Episódio',aired:'2020-01-01'})),pagination:{items:{per_page:50},has_next_page:params.page<3}});}return resources.get(params.page);}});
 const a=await episodes(9000000001,1),b=await episodes(9000000001,2);assert.equal(calls,1);assert.equal(a.episodes.length,25);assert.equal(b.episodes[0].episodeNumber,26);assert.equal(b.nextPage,3);await episodes(9000000001,3);assert.equal(calls,2);
});
test('broadcast estimates use supplied Japanese schedules only and never mark episodes as released',()=>{const item={releaseStatus:'Returning Series',broadcast:{day:'Saturdays',time:'23:00',timezone:'JST'}};const next=nextAnimeBroadcast(item,new Date('2026-11-04T15:00:00Z'));assert.equal(next.date,'2026-11-07T14:00:00.000Z');assert.equal(next.days,3);assert.equal(nextAnimeBroadcast({...item,releaseStatus:'Ended'}),null);assert.equal(nextAnimeBroadcast({...item,broadcast:{...item.broadcast,timezone:'Unknown'}}),null);});
test('bulk watched progress binds the owner, preserves canonical units and never writes reviews; future episodes reject the whole batch',async()=>{
 const writes=[],database={from:table=>({upsert:async value=>{writes.push({table,value});return {};}})},load=async()=>({episodes:[1,2].map(n=>({seriesId:9000000001,episodeNumber:n,seasonNumber:1,name:'Ep '+n,airDate:'2020-01-01'}))}),body={seriesId:9000000001,media:'animes',episodeNumbers:[1,2],user_id:'forged'};
 await writeAnimeEpisodeBatch({reader:database,admin:database,owner:'actual',body,episodes:load});assert.equal(writes.length,2);assert.equal(writes[1].table,'void_series_episode_progress');assert.ok(writes[1].value.every(row=>row.user_id==='actual'&&row.series_id===9000000001&&row.season_number===1));
 writes.length=0;await assert.rejects(writeAnimeEpisodeBatch({reader:database,admin:database,owner:'actual',body,episodes:async()=>({episodes:[{seriesId:9000000001,episodeNumber:1,airDate:'2099-01-01'}]})}),/UNRELEASED/);assert.equal(writes.length,0);await assert.rejects(writeAnimeEpisodeBatch({reader:database,admin:database,owner:'actual',body:{...body,episodeNumbers:[1,1]},episodes:load}),/INVALID/);
});
