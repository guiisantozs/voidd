import test from 'node:test';
import assert from 'node:assert/strict';
import {createSeriesEditorial,distributeSeriesEditorial,SERIES_EDITORIAL_RULES} from '../lib/series-editorial.js';
import {normalizeSeries} from '../lib/series-model.js';
import {rankRecentSeriesReviews} from '../lib/series-community-ranking.js';
import {episodeIdentity,episodeAlreadyAired,latestRecentEpisode,selectEpisodeHighlights,episodeReviewHref,parseEpisodeReviewTarget,recentEpisode} from '../lib/episode-releases.js';
import {createPublicCatalogClient} from '../lib/public-catalog-client.js';

const now=new Date('2026-11-03T15:00:00Z');
const raw=(id,extra={})=>({id,name:`Series ${id}`,poster_path:'/p.jpg',backdrop_path:'/b.jpg',genre_ids:[18],genres:[{id:18}],origin_country:['US'],first_air_date:'2020-01-01',vote_average:8.4,vote_count:3000,popularity:50,dayRank:id%20,weekRank:id%40,last_episode_to_air:{id:id*10,season_number:2,episode_number:4,name:'Episode',air_date:'2026-11-01'},...extra});
const ep=(seriesId,extra={})=>({id:seriesId*10,seriesId,seasonNumber:2,episodeNumber:4,name:'Episode',airDate:'2026-11-01',...extra});
test('global edition separates hero, trends and quality with deterministic, disjoint selections and honest small pools',()=>{
 const source=Array.from({length:40},(_,i)=>raw(i+1));
 const result=distributeSeriesEditorial(source,now),ids=[...result.hero,...result.trending,...result.weekly].map(row=>row.id);
 assert.equal(result.hero.length,5);assert.equal(result.trending.length,18);assert.equal(result.weekly.length,5);assert.equal(new Set(ids).size,ids.length);
 assert.deepEqual(distributeSeriesEditorial(source,now),result);assert(result.weekly.every(row=>row.tmdbVoteCount>=1000&&row.tmdbRating>=7.8));
 const small=distributeSeriesEditorial([raw(1),raw(2,{vote_count:3,vote_average:10})],now);assert.equal(small.hero.length,1);assert.equal(small.trending.length,0);assert.equal(small.weekly.length,0);
});
test('global selections reject future, undated, weak, adult, keyword anime, special programming and low-vote perfect scores',()=>{
 const bad=[raw(1,{first_air_date:'2099-01-01'}),raw(2,{first_air_date:null}),raw(3,{vote_count:1,vote_average:10}),raw(4,{adult:true}),raw(5,{keywords:{results:[{name:'anime'}]}}),raw(6,{genre_ids:[10767]}),raw(7,{vote_average:2})];
 const result=distributeSeriesEditorial(bad,now);assert.equal(result.hero.length+result.trending.length+result.weekly.length,0);assert.deepEqual(result.episodes,[]);
});
test('edition shares concurrent work, bounds cold requests, stays stable six hours and renews from current trends',async()=>{
 let clock=now.getTime(),calls=0,version=0;
 const service=createSeriesEditorial({clock:()=>clock,resource:async(path,params)=>{
  calls++;
  if(path.startsWith('trending/'))return {results:Array.from({length:20},(_,i)=>raw(version+1+i+(params.page===2?20:0)))};
  return raw(Number(path.split('/').at(-1)));
 }});
 const [a,b]=await Promise.all([service.get(),service.get()]);assert.deepEqual(a,b);assert.equal(calls,33);
 const ids=a.hero.map(row=>row.id);clock+=6*3600000-1;await service.get();assert.equal(calls,33);
 version=100;clock+=2;const next=await service.get();assert.equal(calls,66);assert.notDeepEqual(next.hero.map(row=>row.id),ids);
});
test('last good editorial edition survives outages only within a bounded period, with failure backoff',async()=>{
 let clock=now.getTime(),fail=false,calls=0;
 const service=createSeriesEditorial({clock:()=>clock,resource:async path=>{calls++;if(fail)throw Error('unavailable');return path.startsWith('trending/')?{results:[raw(1)]}:raw(1);}});
 const before=await service.get();fail=true;clock+=6*3600000+1;
 const fallback=await service.get();assert.equal(fallback.stale,true);assert.equal(fallback.partial,true);assert.deepEqual(fallback.hero,before.hero);
 const failedCalls=calls;await service.get();assert.equal(calls,failedCalls);
 clock=now.getTime()+24*3600000+1;await assert.rejects(service.get(),/unavailable/);
});
test('community volume, recent growth and real interactions rank independently of worldwide scores and preserve zero',()=>{
 const item=id=>normalizeSeries(raw(id)),row=(user,id,age,rating=0)=>({user_id:user,item_key:`series:${id}`,item:item(id),created_at:new Date(now.getTime()-age*86400000).toISOString(),rating,comments:0});
 const rows=[row('a',1,1),row('b',1,4),row('c',2,1,5),row('d',3,8,5),row('a',1,1),row('e',4,-1),row('f',5,0,5)];rows.at(-1).item.categoria='jogos';
 const ranked=rankRecentSeriesReviews(rows,{now:now.getTime()});assert.deepEqual(ranked.map(row=>row.id),[1,2]);assert.equal(ranked[0].reviews,2);assert.equal(ranked[0].recentReviews,1);assert.equal(ranked[1].reviews,1);
 assert.deepEqual(rankRecentSeriesReviews([],{now:now.getTime()}),[]);
});
test('new episode requires relevant series plus real recent release, excludes futures, specials and promotional content',()=>{
 const result=distributeSeriesEditorial([raw(1),raw(2,{vote_count:20}),raw(3,{last_episode_to_air:{season_number:2,episode_number:4,air_date:'2026-11-04'}}),raw(4,{last_episode_to_air:{season_number:0,episode_number:4,air_date:'2026-11-01'}}),raw(5,{last_episode_to_air:{season_number:1,episode_number:1,name:'Trailer: Season',air_date:'2026-11-01'}})],now);
 assert.deepEqual(result.episodes.map(row=>row.series.id),[1]);assert(result.hero.some(row=>row.id===1));
 assert.equal(recentEpisode(ep(1,{airDate:null}),{now}),false);assert.equal(recentEpisode(ep(1,{airDate:'2026-02-30'}),{now}),false);
 assert.equal(recentEpisode(ep(1,{airDate:'2026-10-20'}),{now}),true);assert.equal(recentEpisode(ep(1,{airDate:'2026-10-19'}),{now}),false);
 assert.equal(recentEpisode(ep(1,{episodeType:'special'}),{now}),false);
});
test('episode release uses Sao Paulo day and defers date-only same-day announcements; exact future instants remain excluded',()=>{
 assert.equal(episodeAlreadyAired(ep(1,{airDate:'2026-11-03'}),now),false);
 assert.equal(episodeAlreadyAired(ep(1,{airDate:'2026-11-03',airDateTime:'2026-11-03T14:00:00Z'}),now),true);
 assert.equal(episodeAlreadyAired(ep(1,{airDate:'2026-11-03',airDateTime:'2026-11-03T16:00:00Z'}),now),false);
 assert.equal(episodeAlreadyAired(ep(1,{airDate:'2026-11-02'}),new Date('2026-11-03T01:00:00Z')),false);
});
test('episode highlights prioritize seven days, expand only when sparse, and choose the newest episode per series even if rated',()=>{
 const candidates=[{series:{id:1},episode:ep(1)},{series:{id:1},episode:ep(1,{episodeNumber:5,airDate:'2026-11-02'})},{series:{id:2},episode:ep(2,{airDate:'2026-10-25'})}];
 const full=selectEpisodeHighlights(candidates,{now,target:1});assert.equal(full.windowDays,7);assert.equal(full.episodes.length,1);assert.equal(full.episodes[0].episode.episodeNumber,5);
 const sparse=selectEpisodeHighlights(candidates,{now,target:12});assert.equal(sparse.windowDays,14);assert.equal(sparse.episodes.length,2);
 assert.equal(latestRecentEpisode(candidates.map(row=>row.episode),{now}).episodeNumber,5);
});
test('canonical episode links validate every coordinate, support anime identity and do not accept arbitrary modal targets',()=>{
 assert.equal(episodeIdentity('series',ep(4)),'series:4:2:4');assert.equal(episodeIdentity('animes',ep(4)),'animes:4:2:4');
 assert.equal(episodeReviewHref('series',ep(4)),'/obra/series/4?season=2&episode=4&review=episode');
 assert.equal(episodeIdentity('filmes',ep(4)),null);assert.equal(episodeIdentity('series',ep(4,{seasonNumber:0})),null);
 assert.deepEqual(parseEpisodeReviewTarget({season:'2',episode:'4',review:'episode'},4),{seriesId:4,seasonNumber:2,episodeNumber:4});
 for(const query of [{season:['2'],episode:'4',review:'episode'},{season:'0',episode:'4',review:'episode'},{season:'1001',episode:'4',review:'episode'},{season:'2',episode:'4',review:'general'}])assert.equal(parseEpisodeReviewTarget(query,4),null);
});
test('public editorial cache never contains personalized reviews and season/recent requests share client work',async()=>{
 let calls=0;const client=createPublicCatalogClient({storage:()=>null,fetcher:async()=>{calls++;return new Response('{"hero":[],"trending":[],"weekly":[]}',{headers:{'Content-Type':'application/json'}});}});
 await Promise.all([client.request('/api/series/editorial'),client.request('/api/series/editorial')]);assert.equal(calls,1);
 assert.throws(()=>client.request('/api/series-unit'),/PUBLIC_CATALOG_ROUTE_REQUIRED/);
});
