import test from 'node:test';
import assert from 'node:assert/strict';
import {rankCurrentAnime,analyzeAnimeRelevance,distributeCurrentAnime,animeSelectionDiagnostic} from '../lib/anime-relevance.js';
import {animeDisplayTitle,withAnimeDisplayTitle} from '../lib/anime-titles.js';
import {createAnimeTrendSource,normalizeAniListSignals} from '../lib/anime-trend-source.js';
const now=new Date('2026-11-04T12:00:00Z'),epoch=now.getTime()/1000;
function show(n,{age=20,episode=null,popularity=300000,status='RELEASING',activity=800}={}){
 const date=new Date(now.getTime()-age*86400000).toISOString().slice(0,10);
 return {id:9000000000+n,categoria:'animes',titulo:'Canonical '+n,format:'TV',estreia:date,trendSignals:{source:'AniList',observedAt:now.getTime(),status,startDate:date,popularity,trending:200,daily:Array.from({length:16},(_,i)=>({date:epoch-(i+1)*86400,trending:activity,releasing:episode!==null&&i===episode-1,episode:episode!==null&&i===episode-1?4:null})),relations:[]}};
}
test('active recognized franchises rank ahead of similarly active new obscure titles, without admitting inactive classics',()=>{
 const known=show(1),unknown=show(2,{popularity:2000}),old=show(3,{age:7000,status:'FINISHED',popularity:3000000});
 const ranked=rankCurrentAnime([unknown,old,known],{now});
 assert.equal(ranked[0].id,known.id);assert.equal(ranked.some(row=>row.id===old.id),false);assert.equal(analyzeAnimeRelevance(old,{now}).eligible,false);
 const inactive=show(4,{popularity:1000000,activity:0});inactive.trendSignals.trending=0;assert.equal(analyzeAnimeRelevance(inactive,{now}).eligible,false);
});
test('a real new season inherits recognition only through typed links while keeping its own recent events and ID',()=>{
 const sequel=show(1,{popularity:1000,episode:2});sequel.trendSignals.relations=[{relation:'PREQUEL',malId:99,popularity:800000}];
 const a=analyzeAnimeRelevance(sequel,{now});assert.ok(a.recognitionScore>.9);assert.equal(a.episodeDays,2);
 sequel.trendSignals.relations[0].relation='CHARACTER';assert.equal(analyzeAnimeRelevance(sequel,{now}).recognitionReach,1000);
});
test('availability is a small ranking hint and never a veto against hits from other platforms',()=>{
 const showA=show(1),base=analyzeAnimeRelevance(showA,{now});showA.crunchyrollBrazil=true;const withCr=analyzeAnimeRelevance(showA,{now});
 assert.equal(base.eligible,true);assert.equal(withCr.regionalScore,0);assert.ok(withCr.score-base.score<=1.21);assert.ok(withCr.score>base.score);
});
test('weekly widens to 14 and then 30 days only when seven-day results are insufficient',()=>{
 for(const age of [10,20]){
  const ranked=rankCurrentAnime(Array.from({length:8},(_,i)=>show(i+1,{age,status:'FINISHED'})),{now}),result=distributeCurrentAnime(ranked,ranked);
  assert.equal(result.weekly.length,8);assert.equal(result.weeklyWindowDays,age===10?14:30);
 }
 const ranked=rankCurrentAnime(Array.from({length:8},(_,i)=>show(i+1,{age:2,status:'FINISHED'})),{now});
 assert.equal(distributeCurrentAnime(ranked,ranked).weeklyWindowDays,7);
});
test('weekly prioritizes actual recent events and does not consume candidates reserved for the hero or trends',()=>{
 const ranked=rankCurrentAnime([show(1,{episode:1}),show(2,{episode:12}),show(3,{age:22,status:'FINISHED'})],{now}),result=distributeCurrentAnime(ranked,ranked);
 assert.equal(result.weekly[0].id,9000000001);assert.equal(result.weeklyWindowDays,30);
 assert.ok(result.hero.some(row=>result.trending.some(other=>row.id===other.id)));
 const row=animeSelectionDiagnostic(result.hero[0],result);assert.deepEqual(row.selectedSections,['hero','weekly','trending']);
});
test('display titles use official localized/international aliases while retaining canonical title and identity',()=>{
 const item={id:9000000001,titulo:'A very long canonical Japanese romanized production title',englishTitle:'Known English Title',internationalTitle:'Known Title'};
 const result=withAnimeDisplayTitle(item);assert.equal(result.displayTitle,'Known Title');assert.equal(result.titulo,item.titulo);assert.equal(result.id,item.id);
 assert.equal(animeDisplayTitle({...item,localizedTitle:'Título oficial'}),'Título oficial');
 assert.equal(animeDisplayTitle({titulo:'Only provided name'}),'Only provided name');
});
test('AniList member counts stay global recognition data and never become regional evidence',()=>{
 const [item]=normalizeAniListSignals([{id:1,idMal:21,type:'ANIME',isAdult:false,format:'TV',status:'RELEASING',popularity:500000,title:{romaji:'Production'},relations:{edges:[{relationType:'PREQUEL',node:{idMal:20,type:'ANIME',isAdult:false,popularity:1000000,title:{romaji:'Parent'}}}]}}],now);
 assert.equal(item.trendSignals.popularity,500000);assert.equal(item.trendSignals.relations[0].popularity,1000000);assert.equal(analyzeAnimeRelevance(item,{now}).regionalScore,0);
});
test('source diagnostics count raw candidates, merged duplicates and temporal exclusions',async()=>{
 const media={id:1,idMal:1,type:'ANIME',isAdult:false,format:'TV',status:'RELEASING',title:{romaji:'Current'},startDate:{year:2026,month:10,day:30},trending:300,popularity:300000,trends:{nodes:show(1).trendSignals.daily}};
 const source=createAnimeTrendSource({clock:()=>now,fetcher:async()=>new Response(JSON.stringify({data:{season:{media:[media]},airing:{media:[media]},trending:{media:[media,{...media,id:2,idMal:2,status:'NOT_YET_RELEASED',startDate:{year:2027,month:1,day:1}}]}}})),resource:async()=>({data:[]}),regional:async()=>({entries:[],sources:[]}),detail:async id=>({id,categoria:'animes',titulo:'Current'})});
 const result=await source();assert.equal(result.sourceStats[0].returned,1);assert.equal(result.funnel.sourceRows,4);assert.equal(result.funnel.uniqueCandidates,2);assert.equal(result.funnel.duplicateOrInvalidRows,2);assert.equal(result.funnel.removedByCurrentOrFranchise,1);assert.equal(result.funnel.hydrated,1);
 assert.equal(result.sourceStats[2].filteredCurrentOrFranchise,1);assert.equal(result.sourceStats[2].activityEligible,1);assert.equal(result.sourceStats[0].candidateIds,undefined);
});
