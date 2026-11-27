import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeAnimeRelevance,rankCurrentAnime,distributeCurrentAnime,publicAnimeDiscoveryItem,completeAnimeDate,animeSelectionDiagnostic} from '../lib/anime-relevance.js';
import {normalizeAniListSignals,createAnimeTrendSource,ANIME_TREND_QUERY} from '../lib/anime-trend-source.js';
const now=new Date('2026-11-04T12:00:00Z'),epoch=Math.floor(now.getTime()/1000),id=n=>9000000000+n;
const daily=(recent=300,before=100)=>Array.from({length:16},(_,i)=>({date:epoch-(i+1)*86400,trending:i<7?recent:before,releasing:false,episode:null}));
const item=(n,extra={})=>({id:id(n),categoria:'animes',titulo:'Anime '+n,format:'TV',estreia:'2026-10-15',genreIds:[1],brazilAvailable:true,trendSignals:{source:'AniList',observedAt:now.getTime(),status:'RELEASING',startDate:{year:2026,month:10,day:15},trending:120,popularity:10000,daily:daily(),relations:[]},...extra});
const regional=()=>({source:'Google Trends RSS',country:'BR',scope:'production',score:.8,date:'2026-11-03T12:00:00Z'});
function classic(){return item(1,{titulo:'Naruto',estreia:'2002-10-03',trendSignals:{source:'AniList',observedAt:now.getTime(),status:'FINISHED',startDate:{year:2002,month:10,day:3},trending:500,popularity:10000000,averageScore:99,daily:daily(900,900),relations:[]}});}

test('A: Naruto with stable activity and historical millions is excluded, while acclaim remains separate',()=>{
 const old=classic(),a=analyzeAnimeRelevance(old,{now});assert.equal(a.currentEligible,false);assert.equal(a.eligible,false);assert.equal(rankCurrentAnime([old],{now}).length,0);assert.ok(a.reasons.includes('no-recent-event-or-measured-growth'));
 // Even a regional search mention cannot substitute for a recent event.
 old.regionalEvidence=[regional()];assert.equal(analyzeAnimeRelevance(old,{now}).eligible,false);
});
test('B: new Black Clover production is current only when its actual date/status permit it',()=>{
 const sequel=item(2,{titulo:'Black Clover Season 2'});sequel.trendSignals.relations=[{relation:'PREQUEL',malId:1}];
 assert.equal(analyzeAnimeRelevance(sequel,{now}).eligible,true);
 sequel.trendSignals.status='NOT_YET_RELEASED';assert.equal(analyzeAnimeRelevance(sequel,{now}).status,'upcoming');assert.equal(rankCurrentAnime([sequel],{now}).length,0);
 sequel.trendSignals.status='RELEASING';sequel.trendSignals.startDate={year:2027,month:1,day:1};assert.equal(analyzeAnimeRelevance(sequel,{now}).eligible,false);
});
test('C: actual One Piece episode event works without changing the 1999 production identity',()=>{
 const show=item(21,{titulo:'One Piece',estreia:'1999-10-20'});show.trendSignals.startDate={year:1999,month:10,day:20};show.trendSignals.daily[0]={date:epoch-86400,episode:1170,releasing:true,trending:300};
 const a=analyzeAnimeRelevance(show,{now});assert.equal(a.eligible,true);assert.equal(a.episodeDays,1);assert.equal(a.episodeNumber,1170);assert.equal(a.factors.premiere,0);assert.equal(a.trendingEligible,true);assert.equal(show.id,id(21));
});
test('D: a new anime with weak engagement and availability alone is excluded',()=>{
 const show=item(4);show.trendSignals.daily=daily(10,10);show.trendSignals.trending=2;show.trendSignals.popularity=10000000;
 const a=analyzeAnimeRelevance(show,{now});assert.equal(a.currentEligible,true);assert.equal(a.regionalScore,0);assert.equal(a.eligible,false);assert.equal(a.confidence,0);
});
test('E: Jujutsu/Mushoku sequels use their own events, never transfer activity to their predecessors',()=>{
 const original=classic(),sequel=item(3,{titulo:'Jujutsu Kaisen Season 3'});sequel.trendSignals.relations=[{relation:'PREQUEL',malId:1}];
 const ranked=rankCurrentAnime([original,sequel],{now});assert.deepEqual(ranked.map(row=>row.id),[sequel.id]);assert.ok(ranked[0].franchiseReferences.some(row=>row.id===original.id));assert.equal(ranked[0].relevance.factors.recentSequel,.10);
});
test('F: regional outage preserves recent global trends on any platform, with lower confidence',()=>{
 const show=item(2),a=analyzeAnimeRelevance(show,{now});assert.equal(a.eligible,true);assert.equal(a.regionalScore,0);assert.equal(a.confidence,.50);
 delete show.brazilAvailable;const otherPlatform=analyzeAnimeRelevance(show,{now});assert.equal(otherPlatform.eligible,true);assert.equal(otherPlatform.regionalScore,0);assert.equal(otherPlatform.confidence,.40);
 assert.equal(analyzeAnimeRelevance(classic(),{now}).eligible,false);
});
test('verified Brazilian signal raises regional indicator and confidence, availability never does',()=>{
 const show=item(1),base=analyzeAnimeRelevance(show,{now});show.regionalEvidence=[regional()];const a=analyzeAnimeRelevance(show,{now});
 assert.ok(a.regionalScore>.7);assert.ok(a.confidence>base.confidence);assert.ok(a.score>base.score);
 show.regionalEvidence=[{...regional(),country:'JP'}];assert.equal(analyzeAnimeRelevance(show,{now}).regionalScore,0);
 show.regionalEvidence=[{...regional(),scope:'franchise'}];assert.equal(analyzeAnimeRelevance(show,{now}).regionalScore,0);
});
test('measured growth compares recent seven days with earlier observed days; missing data stays missing',()=>{
 const show=classic();show.trendSignals.daily=daily(300,100);const a=analyzeAnimeRelevance(show,{now});assert.equal(a.growth,2);assert.equal(a.eligible,true);
 show.trendSignals.daily=daily(300,0);assert.equal(analyzeAnimeRelevance(show,{now}).growth,null);
 show.trendSignals.daily=daily().slice(0,2);assert.equal(analyzeAnimeRelevance(show,{now}).growth,null);
});
test('dates, source freshness and future episode records are validated',()=>{
 assert.equal(completeAnimeDate({year:2026}),null);assert.equal(completeAnimeDate('2026-02-30'),null);
 const show=classic();show.trendSignals.daily=[{date:epoch+86400,episode:99,releasing:true,trending:99999}];show.trendSignals.observedAt=now.getTime()-86400000;
 const a=analyzeAnimeRelevance(show,{now});assert.equal(a.episodeDate,null);assert.equal(a.eligible,false);
 show.regionalEvidence=[{...regional(),date:'2027-01-01'}];assert.equal(analyzeAnimeRelevance(show,{now}).regionalScore,0);
 show.regionalEvidence=[{...regional(),date:'2026-10-01'}];assert.equal(analyzeAnimeRelevance(show,{now}).regionalScore,0);
});
test('old anime needs meaningful growth or an actual release event, not a tiny positive hourly counter',()=>{
 const show=classic();show.trendSignals.trending=1;show.trendSignals.daily=daily(1,1);assert.equal(analyzeAnimeRelevance(show,{now}).currentEligible,false);
});
test('current trends are ranked without a top-quartile admission veto; expired observations still fail',()=>{
 const shows=Array.from({length:20},(_,i)=>{const show=item(i+1);show.trendSignals.daily=daily(220+i*200,220+i*200);show.trendSignals.trending=110+i*30;return show;});
 const ranked=rankCurrentAnime(shows,{now});assert.equal(ranked.find(row=>row.id===id(1)).relevance.eligible,true);assert.equal(ranked.find(row=>row.id===id(20)).relevance.eligible,true);
 const high=ranked.find(row=>row.id===id(20)),stale=analyzeAnimeRelevance(high,{now:new Date(now.getTime()+13*3600000)});assert.equal(stale.strongGlobal,false);
});
test('same name never joins different productions; typed relations through intermediate seasons do',()=>{
 const a=item(1),b=item(2);a.titulo=b.titulo='Same name';let ranked=rankCurrentAnime([a,b,a],{now});assert.equal(ranked.length,2);assert.notEqual(ranked[0].franchiseKey,ranked[1].franchiseKey);
 a.trendSignals.relations=[{relation:'SEQUEL',malId:99}];b.trendSignals.relations=[{relation:'PREQUEL',malId:99}];ranked=rankCurrentAnime([a,b],{now});assert.equal(ranked[0].franchiseKey,ranked[1].franchiseKey);
});
test('hero, weekly and trends select independently, deduplicate within each section and permit the best titles in all three',()=>{
 const ranked=rankCurrentAnime(Array.from({length:18},(_,i)=>item(i+1)),{now}),sections=distributeCurrentAnime(ranked,ranked.slice(0,15));
 assert.equal(sections.hero.length,5);assert.equal(sections.weekly.length,10);assert.equal(sections.trending.length,12);
 for(const key of ['hero','weekly','trending'])assert.equal(new Set(sections[key].map(row=>row.id)).size,sections[key].length);
 assert.ok(sections.hero.some(row=>sections.trending.some(other=>row.id===other.id)));assert.ok(sections.weekly.some(row=>sections.hero.some(other=>row.id===other.id)));
 assert.equal(distributeCurrentAnime(ranked.slice(0,2),ranked.slice(0,2)).hero.length,2);
 const safe=publicAnimeDiscoveryItem(sections.hero[0]);for(const field of ['trendSignals','relevance','regionalEvidence','franchiseReferences'])assert.equal(safe[field],undefined);
});
test('normalization rejects ambiguous MAL associations/adult titles and preserves movie identity',()=>{
 const row={id:1,idMal:21,type:'ANIME',isAdult:false,format:'MOVIE',title:{romaji:'One Piece'},startDate:{year:2026,month:10,day:20}};
 assert.equal(normalizeAniListSignals([row,row],now).length,1);assert.equal(normalizeAniListSignals([row,{...row,id:2}],now).length,0);assert.equal(normalizeAniListSignals([{...row,isAdult:true}],now).length,0);assert.equal(normalizeAniListSignals([row],now)[0].format,'Movie');
 assert.doesNotMatch(ANIME_TREND_QUERY,/POPULARITY_DESC|averageScore/);assert.match(ANIME_TREND_QUERY,/status:RELEASING/);
});
test('AniList outage may use a recent MAL release only with verified Brazilian evidence, not member counts',async()=>{
 let details=0;const options={clock:()=>now,fetcher:async()=>{throw Error('offline');},resource:async()=>({data:[{mal_id:1,members:20000000,title:'New release',type:'TV',aired:{from:'2026-10-30'}}]}),detail:async id=>{details++;return {id,categoria:'animes',titulo:'New release',estreia:'2026-10-30'};},regional:async()=>({entries:[{...regional(),title:'New release'}]})};
 const data=await createAnimeTrendSource(options)();assert.equal(data.partial,true);assert.equal(data.hero[0].id,id(1));assert.equal(details,1);
 await assert.rejects(createAnimeTrendSource({...options,regional:async()=>({entries:[]})})(),/DISCOVERY_UNAVAILABLE/);
});
test('fresh released episodes may resolve stale MAL planned status, but cannot override an AniList announcement',()=>{
 const show=item(1,{releaseStatus:'Planned'});assert.equal(analyzeAnimeRelevance(show,{now}).eligible,false);show.trendSignals.daily[0]={date:epoch-86400,episode:2,releasing:true,trending:300};
 assert.equal(analyzeAnimeRelevance(show,{now}).statusConflict,true);show.trendSignals.status='NOT_YET_RELEASED';assert.equal(analyzeAnimeRelevance(show,{now}).eligible,false);
});
test('diagnostic explains exclusion and keeps source/event/independent scores',()=>{
 const show=classic(),row=animeSelectionDiagnostic({...show,relevance:analyzeAnimeRelevance(show,{now})},{});
 assert.equal(row.title,'Naruto');assert.equal(row.selected,'none');assert.equal(row.source,'AniList');assert.equal(row.analysis.regionalScore,0);assert.ok(row.reasons.includes('no-recent-event-or-measured-growth'));
});
test('historical reception is still available in acclaimed independently of discovery',async()=>{
 const {getAnimeSection}=await import('../lib/anime-catalog.js');let params;
 const result=await getAnimeSection('acclaimed',1,{resource:async(path,query)=>{assert.equal(path,'top/anime');params=query;return {data:[{mal_id:20,title:'Naruto',type:'TV',members:3000000,score:8,scored_by:1000,aired:{from:'2002-10-03'}}]};}});
 assert.equal(params.filter,undefined);assert.equal(result.movies[0].titulo,'Naruto');
});
