import {validReleaseDate} from './movie-release.js';

const DAY=86400000;
export const ANIME_TREND_RULES={recentDays:7,premiereDays:30,seasonDays:90,cacheHours:6,maxCandidates:48,maxDetails:24,maxArtwork:24,heroCount:5,weeklyMin:6,weeklyMax:10,trendingMax:12};
export const ANIME_RANK_WEIGHTS={regional:.10,current:.25,global:.35,recognition:.30};
export const BRAZIL_DISCOVERY_RULES={minimumHourlyActivity:100,minimumDailyActivity:200,minimumGrowth:.25};
const clamp=value=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));
const log=(value,ceiling)=>clamp(Math.log10(1+Math.max(0,value||0))/Math.log10(1+ceiling));
const mean=rows=>rows.length?rows.reduce((sum,row)=>sum+row.trending,0)/rows.length:null;
export function animeRecognitionReach(item){
 return Math.max(0,Number(item.trendSignals?.popularity)||0,...(item.trendSignals?.relations||[]).filter(row=>['PREQUEL','SEQUEL'].includes(row.relation)).map(row=>Number(row.popularity)||0));
}

export function completeAnimeDate(value){
 const date=typeof value==='string'&&/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)?value.slice(0,10):value?.year&&value?.month&&value?.day?[value.year,String(value.month).padStart(2,'0'),String(value.day).padStart(2,'0')].join('-'):null;
 return date&&validReleaseDate(date)?date:null;
}

export function analyzeAnimeRelevance(item,{now=new Date(),rules=ANIME_TREND_RULES,weights=ANIME_RANK_WEIGHTS}={}){
 const signal=item.trendSignals||{},instant=now.getTime(),date=completeAnimeDate(signal.startDate)||completeAnimeDate(item.estreia),age=date?(instant-Date.parse(date))/DAY:null;
 const rows=[...new Map((signal.daily||[]).filter(row=>Number.isFinite(row.date)&&row.date*1000<=instant&&instant-row.date*1000<=30*DAY).map(row=>[Math.floor(row.date/86400),row])).values()].sort((a,b)=>b.date-a.date);
 const valid=rows.filter(row=>Number.isFinite(row.trending)&&row.trending>=0),week=valid.filter(row=>instant-row.date*1000<=7*DAY),before=valid.filter(row=>instant-row.date*1000>7*DAY),average=mean(week),baseline=mean(before);
 // Compare observed periods, never invent missing days or a zero baseline.
 const growth=week.length>=3&&before.length>=3&&baseline>0?(average-baseline)/baseline:null;
 const episode=rows.find(row=>row.episode>0&&row.releasing===true),episodeDays=episode?(instant-episode.date*1000)/DAY:null;
 const fresh=Number.isFinite(signal.observedAt)&&instant-signal.observedAt>=0&&instant-signal.observedAt<=12*3600000;
 const hourly=fresh&&Number.isFinite(signal.trending)?Math.max(0,signal.trending):0;
 const premiere=age!==null&&age>=0&&age<=rules.seasonDays,recentEpisode=episodeDays!==null&&episodeDays<=14;
 const growing=growth!==null&&growth>=BRAZIL_DISCOVERY_RULES.minimumGrowth&&average>=100;
 const releasing=signal.status?signal.status==='RELEASING':item.releaseStatus==='Returning Series';
 const active=releasing&&fresh&&rows.some(row=>row.releasing===true&&instant-row.date*1000<=7*DAY)&&(hourly>0||average>0);
 const confirmedRelease=fresh&&signal.status==='RELEASING'&&recentEpisode;
 const future=age!==null&&age<0||signal.status==='NOT_YET_RELEASED'||item.releaseStatus==='Planned'&&!confirmedRelease;
 const currentEligible=item.categoria==='animes'&&!future&&(premiere||recentEpisode||active||growing);
 const absoluteGlobal=week.length>=3&&average>=BRAZIL_DISCOVERY_RULES.minimumDailyActivity&&hourly>=BRAZIL_DISCOVERY_RULES.minimumHourlyActivity||growing&&week.length>=3&&average>=BRAZIL_DISCOVERY_RULES.minimumDailyActivity;
 const strongGlobal=absoluteGlobal;
 const sources=(item.regionalEvidence||[]).filter(row=>row.country==='BR'&&row.scope==='production'&&['Google Trends RSS','Netflix Top 10','JBox RSS','IntoxiAnime RSS'].includes(row.source)&&Number.isFinite(Date.parse(row.date))&&Date.parse(row.date)<=instant&&instant-Date.parse(row.date)<=30*DAY);
 const regional=sources.map(row=>({...row,ageDays:(instant-Date.parse(row.date))/DAY})).filter(row=>row.source==='Netflix Top 10'||row.ageDays<=7);
 const regionalScore=regional.reduce((best,row)=>Math.max(best,clamp(row.score)*Math.max(.3,1-row.ageDays/35)*(row.stale?.7:1)),0);
 const brazilHint=!!(item.brazilAvailable||item.crunchyrollBrazil||item.brazilFranchiseAvailable||item.regionalHints?.length);
 const verifiedRegional=regionalScore>=.35,regionalEligible=verifiedRegional||brazilHint;
 const recognitionReach=animeRecognitionReach(item),recognitionScore=clamp((Math.log10(1+recognitionReach)-4)/2);
 const sequel=(signal.relations||[]).some(row=>row.relation==='PREQUEL');
 const factors={
  premiere:premiere?(age<=7?.40:age<=30?.32:.18):0,
  recentEpisode:recentEpisode?(episodeDays<=7?.45:.25):0,
  activeSeason:active?.15:0,
  recentSequel:sequel&&premiere?.10:0,
  growth:growing?.25*clamp(growth):0
 };
 const currentScore=clamp(Object.values(factors).reduce((sum,value)=>sum+value,0));
 const hourlyScore=fresh?(.5*log(hourly,1500)+.5*(signal.hourlyPercentile??log(hourly,1500))):0;
 const dailyScore=average===null?0:(.5*log(average,6000)+.5*(signal.dailyPercentile??log(average,6000)));
 const globalScore=clamp(.30*hourlyScore+.50*dailyScore+.20*clamp(growth===null?0:growth));
 const totalWeight=weights.regional+weights.current+weights.global+weights.recognition;
 if(!(totalWeight>0)||Object.values(weights).some(value=>!Number.isFinite(value)||value<0))throw Error('INVALID_ANIME_WEIGHTS');
 // Recognition breaks ties among active candidates. Fame alone never admits
 // an old production. Missing BR coverage no longer vetoes verified activity.
 const regionalContribution=Math.max(regionalScore,brazilHint?.12:0);
 const score=100*(weights.regional*regionalContribution+weights.current*currentScore+weights.global*globalScore+weights.recognition*recognitionScore)/totalWeight;
 const significantActivity=strongGlobal||verifiedRegional&&(globalScore>=.15||premiere||recentEpisode)||recentEpisode&&recognitionScore>=.6&&(hourly>=30||average>=100);
 const eligible=currentEligible&&significantActivity;
 const trendingEligible=eligible&&(strongGlobal||verifiedRegional||recentEpisode&&recognitionScore>=.6);
 const confidence=verifiedRegional?clamp(.65+.25*regionalScore):eligible?(brazilHint?.50:.40):0;
 const reasons=[];
 if(future)reasons.push('future-or-unconfirmed-release');
 if(!currentEligible&&!future)reasons.push('no-recent-event-or-measured-growth');
 if(!significantActivity)reasons.push('insufficient-current-activity');
 if(!verifiedRegional)reasons.push('no-direct-brazil-interest-evidence');
 if(eligible&&!verifiedRegional)reasons.push(brazilHint?'recent-global-activity-with-brazil-availability; not-regional-audience':'verified-global-trend; regional-coverage-unknown');
 if(verifiedRegional)reasons.push('verified-current-brazil-signal');
 if(eligible&&!trendingEligible)reasons.push('below-strict-trending-threshold');
 return {eligible,currentEligible,regionalEligible,trendingEligible,score,trendScore:score,featureScore:score+5*factors.premiere,currentScore,regionalScore,globalScore,recognitionScore,recognitionReach,confidence,strongGlobal,activityPercentile:signal.activityPercentile??null,verifiedRegional,brazilHint,ageDays:age===null?null:Math.floor(age),episodeDays,episodeDate:episode?new Date(episode.date*1000).toISOString():null,episodeNumber:episode?.episode??null,growth,weeklyActivity:average,baselineActivity:baseline,observedDays:week.length,productionDate:date,status:future?'upcoming':releasing?'airing':'released',statusConflict:item.releaseStatus==='Planned'&&confirmedRelease,factors,regionalSources:regional,reasons};
}

export function brazilFocusedCandidate(item){return item.relevance?.eligible===true;}

export function rankCurrentAnime(items,options={}){
 const all=[...new Map(items.map(item=>[item.id,item])).values()].map(item=>({...item,relevance:analyzeAnimeRelevance(item,options)}));
 const current=all.filter(item=>item.relevance.currentEligible&&item.relevance.observedDays>=3);
 const percentile=(value,field)=>value>0&&current.length?current.filter(item=>field(item)<=value).length/current.length:0;
 for(const item of all)if(!Number.isFinite(item.trendSignals?.activityPercentile)){
  const dailyPercentile=percentile(item.relevance.weeklyActivity,row=>row.relevance.weeklyActivity||0),hourlyPercentile=percentile(item.trendSignals?.trending,row=>row.trendSignals?.trending||0);
  item.trendSignals={...item.trendSignals,dailyPercentile,hourlyPercentile,activityPercentile:(dailyPercentile+hourlyPercentile)/2};
  item.relevance=analyzeAnimeRelevance(item,options);
 }
 const parent=new Map(all.map(item=>[item.id,item.id])),root=id=>{let current=id;while(parent.has(current)&&parent.get(current)!==current)current=parent.get(current);return current;};
 for(const item of all)for(const relation of item.trendSignals?.relations||[])if(['PREQUEL','SEQUEL'].includes(relation.relation)&&Number.isSafeInteger(relation.malId)&&relation.malId>0){const id=9000000000+relation.malId;if(!parent.has(id))parent.set(id,id);const a=root(item.id),b=root(id);parent.set(Math.max(a,b),Math.min(a,b));}
 for(const item of all){
  item.franchiseKey=root(item.id);
  item.franchiseReferences=[...new Map([...(item.franchiseReferences||[]),...all.filter(other=>root(other.id)===item.franchiseKey).map(other=>({id:other.id,titulo:other.titulo,englishTitle:other.englishTitle,originalTitle:other.originalTitle,ano:other.ano||other.estreia?.slice(0,4),format:other.format}))].map(other=>[other.id,other])).values()].slice(0,8);
 }
 const rows=all.filter(item=>item.relevance.currentEligible);
 return rows.filter(item=>!rows.some(other=>other.id!==item.id&&other.franchiseKey===item.franchiseKey&&other.relevance.ageDays!==null&&other.relevance.ageDays<=90&&(item.relevance.ageDays===null||other.relevance.ageDays<item.relevance.ageDays)&&other.relevance.score>item.relevance.score)).sort((a,b)=>b.relevance.score-a.relevance.score||b.relevance.confidence-a.relevance.confidence||a.id-b.id);
}

export function distributeCurrentAnime(ranked,qualified,rules=ANIME_TREND_RULES){
 const byId=new Map(qualified.map(item=>[item.id,item]));
 function distinct(rows,limit){const families=new Set(),ids=new Set();return rows.filter(item=>{const family=item.franchiseKey||item.id;if(families.has(family)||ids.has(item.id))return false;families.add(family);ids.add(item.id);return true;}).slice(0,limit);}
 const eligible=ranked.filter(item=>item.relevance.eligible),visual=eligible.filter(item=>byId.has(item.id)).map(item=>({...byId.get(item.id),relevance:item.relevance}));
 const hero=distinct([...visual].sort((a,b)=>(b.relevance.score+5*b.relevance.recognitionScore)-(a.relevance.score+5*a.relevance.recognitionScore)),rules.heroCount);
 // Each section owns deduplication. Hero membership is not an exclusion.
 const trending=distinct(eligible.filter(item=>item.relevance.trendingEligible).sort((a,b)=>b.relevance.trendScore-a.relevance.trendScore),rules.trendingMax);
 let weekly=[],weeklyWindowDays=7;
 for(const window of [7,14,30]){
  weeklyWindowDays=window;
  const pool=visual.filter(item=>item.relevance.episodeDays!==null&&item.relevance.episodeDays<=window||item.relevance.ageDays!==null&&item.relevance.ageDays<=window||item.relevance.growth>=.25||item.relevance.episodeDays===null&&item.relevance.status==='airing'&&item.relevance.observedDays>=3);
  weekly=distinct(pool.sort((a,b)=>{
   const recency=item=>Math.min(item.relevance.episodeDays??Infinity,item.relevance.ageDays??Infinity);
   const recent=item=>recency(item)<=7?3:recency(item)<=14?2:recency(item)<=30?1:0;
   return recent(b)-recent(a)||b.relevance.featureScore-a.relevance.featureScore;
  }),rules.weeklyMax);
  if(weekly.length>=rules.weeklyMin)break;
 }
 return {hero,weekly,trending,weeklyWindowDays};
}

export function animeSelectionDiagnostic(item,sections){
 const selectedSections=['hero','weekly','trending'].filter(key=>sections[key]?.some(row=>row.id===item.id)),selected=selectedSections[0]||'none',analysis=item.relevance||analyzeAnimeRelevance(item);
 return {id:item.id,title:item.titulo,displayTitle:item.displayTitle||item.titulo,production:item.format,franchiseKey:item.franchiseKey,status:analysis.status,sourceStatus:item.trendSignals?.status||item.releaseStatus,productionDate:analysis.productionDate,episodeDate:analysis.episodeDate,episodeNumber:analysis.episodeNumber,source:item.trendSignals?.source||'Jikan-Edge',observedAt:item.trendSignals?.observedAt||null,analysis,selected,selectedSections,reasons:[...analysis.reasons,...(selected==='none'&&analysis.eligible?['outside-section-limit-or-missing-approved-artwork']:[])],artworkStatus:item.artworkMatchStatus,artworkTmdbId:item.artworkTmdbId,regionalHints:item.regionalHints||[],availability:{direct:!!(item.brazilAvailable||item.crunchyrollBrazil),franchise:!!item.brazilFranchiseAvailable}};
}

export function publicAnimeDiscoveryItem(item){const {trendSignals,relevance,franchiseKey,franchiseListReach,franchiseReferences,regionalEvidence,regionalHints,artworkMatchStatus,artworkFailureCode,...safe}=item;return safe;}
