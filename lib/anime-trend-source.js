import {animeResource,normalizeAnime,animeAllowed,getAnimeDetail} from './anime-catalog.js';
import {animeId} from './anime-provider.js';
import {completeAnimeDate,rankCurrentAnime,ANIME_TREND_RULES,analyzeAnimeRelevance,animeSelectionDiagnostic} from './anime-relevance.js';
import {loadBrazilAnimeSignals,attachBrazilEvidence} from './anime-regional-source.js';
import {retryAfterSeconds} from './provider-guard.js';
import {resourceMetrics} from './resource-metrics.js';
import {jikanEndpoint} from './jikan-endpoint.js';
import {reserveGlobalBudget} from './global-provider-budget.js';

const FIELDS='id idMal type isAdult format status trending popularity seasonYear season synonyms startDate{year month day} title{romaji english native} coverImage{extraLarge large} trends(sort:DATE_DESC,perPage:32){nodes{date trending episode releasing}} relations{edges{relationType node{id idMal type isAdult status format popularity title{romaji english native} startDate{year month day}}}}';
// Discovery starts with this season and airing productions. The last page
// admits comebacks only with measured growth; no historical-popularity seed.
export const ANIME_TREND_QUERY='query CurrentAnime($season:MediaSeason,$year:Int){season:Page(perPage:40){media(type:ANIME,isAdult:false,season:$season,seasonYear:$year,sort:TRENDING_DESC){'+FIELDS+'}} airing:Page(perPage:40){media(type:ANIME,isAdult:false,status:RELEASING,sort:TRENDING_DESC){'+FIELDS+'}} trending:Page(perPage:40){media(type:ANIME,isAdult:false,sort:TRENDING_DESC){'+FIELDS+'}}}';

export function normalizeAniListSignals(rows,now){
 const unique=[...new Map(rows.filter(row=>row?.type==='ANIME'&&row.isAdult===false&&animeId(row.idMal)&&!['MUSIC','SPECIAL'].includes(row.format)).map(row=>[row.id,row])).values()],counts=new Map();
 for(const row of unique)counts.set(row.idMal,(counts.get(row.idMal)||0)+1);
 return unique.filter(row=>counts.get(row.idMal)===1).map(row=>({
  id:animeId(row.idMal),categoria:'animes',titulo:row.title?.romaji||row.title?.english||'',englishTitle:row.title?.english||'',originalTitle:row.title?.native||'',alternativeTitles:(row.synonyms||[]).filter(value=>typeof value==='string'),ano:String(row.startDate?.year||''),estreia:completeAnimeDate(row.startDate),format:row.format==='TV_SHORT'?'TV':row.format==='MOVIE'?'Movie':row.format,poster:row.coverImage?.extraLarge||row.coverImage?.large||null,
  trendSignals:{source:'AniList',observedAt:now.getTime(),status:row.status,startDate:row.startDate,seasonYear:row.seasonYear,season:row.season,trending:row.trending,popularity:row.popularity??null,daily:row.trends?.nodes||[],relations:(row.relations?.edges||[]).filter(edge=>edge.node?.type==='ANIME'&&animeId(edge.node.idMal)&&edge.node.isAdult===false).map(edge=>({relation:edge.relationType,malId:edge.node.idMal,popularity:edge.node.popularity??null,artwork:{id:animeId(edge.node.idMal),titulo:edge.node.title?.romaji,englishTitle:edge.node.title?.english,originalTitle:edge.node.title?.native,ano:String(edge.node.startDate?.year||''),format:edge.node.format==='MOVIE'?'Movie':edge.node.format}}))}
 }));
}

export function createAnimeTrendSource({fetcher=(...args)=>fetch(...args),resource=animeResource,detail=getAnimeDetail,regional=loadBrazilAnimeSignals,clock=()=>new Date()}={}){
 let blockedUntil=0;
 return async()=>{
  if(process.env.ANIME_CATALOG_PROVIDER==='disabled')throw Error('CONFIG');
  if(process.env.ANIME_CATALOG_PROVIDER==='jikan')jikanEndpoint(process.env.JIKAN_API_BASE_URL);
  const regionalTask=Promise.resolve().then(()=>regional()).catch(()=>({entries:[],sources:[],unavailable:true}));
  const now=clock(),started=Date.now(),sourceStats=[];let signals=[],partial=false;
  try{
   if(now.getTime()<blockedUntil)throw Error('ANILIST_COOLDOWN');
   await reserveGlobalBudget('anilist');
   const response=await fetcher('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({query:ANIME_TREND_QUERY,variables:{season:['WINTER','SPRING','SUMMER','FALL'][Math.floor(now.getUTCMonth()/3)],year:now.getUTCFullYear()}}),signal:AbortSignal.timeout(12000)});
   if(!response.ok){if(response.status===429)blockedUntil=now.getTime()+retryAfterSeconds(response.headers?.get('Retry-After'))*1000;throw Error('ANILIST_UNAVAILABLE');}
   const data=await response.json();
   if(data.errors?.length||!Array.isArray(data.data?.trending?.media)||!Array.isArray(data.data?.season?.media)||!Array.isArray(data.data?.airing?.media))throw Error('ANILIST_SOURCE');
   for(const name of ['season','airing','trending']){
    const normalized=normalizeAniListSignals(data.data[name].media,now);
    sourceStats.push({source:'AniList:'+name,returned:data.data[name].media.length,accepted:normalized.length,candidateIds:normalized.map(item=>item.id)});
   }
   signals=normalizeAniListSignals([...data.data.season.media,...data.data.airing.media,...data.data.trending.media],now);
  }catch{partial=true;sourceStats.push({source:'AniList',returned:null,accepted:0,status:'unavailable'});blockedUntil=Math.max(blockedUntil,now.getTime()+60000);resourceMetrics.record('anilist:trends','errors');}
  finally{resourceMetrics.record('anilist:trends','requests',Date.now()-started);}
  const pool=new Map();
  try{
   const calendar=await resource('seasons/now',{},21600000),rows=calendar.data||[],allowed=rows.filter(animeAllowed);
   sourceStats.push({source:'Jikan-Edge:season',returned:rows.length,accepted:allowed.length,candidateIds:allowed.map(row=>animeId(row.mal_id))});
   for(const row of allowed){const item=normalizeAnime(row);pool.set(item.id,{...item,trendSignals:{source:'MyAnimeList',popularity:row.members??null}});}
  }catch{partial=true;sourceStats.push({source:'Jikan-Edge:season',returned:null,accepted:0,status:'unavailable'});}
  for(const signal of signals)pool.set(signal.id,{...pool.get(signal.id),...signal});
  const region=await regionalTask;
  const candidates=attachBrazilEvidence([...pool.values()],region);
  const current=rankCurrentAnime(candidates,{now}),eligible=current.filter(item=>item.relevance.eligible),ranked=eligible.slice(0,ANIME_TREND_RULES.maxCandidates),items=[],detailFailures=new Map();
  for(let offset=0;offset<Math.min(ranked.length,ANIME_TREND_RULES.maxDetails);offset+=4){
   const batch=await Promise.allSettled(ranked.slice(offset,offset+4).map(item=>detail(item.id)));
   for(let index=0;index<batch.length;index++){
    const result=batch[index],candidate=ranked[offset+index];
    if(result.status==='fulfilled'&&result.value.id===candidate.id){
     const item={...candidate,...result.value,englishTitle:result.value.englishTitle||candidate.englishTitle,internationalTitle:candidate.englishTitle,trendSignals:candidate.trendSignals};
     // Only actual recent released episodes can resolve a stale MAL date.
     if(candidate.trendSignals?.status==='RELEASING'&&candidate.relevance.episodeDays!==null&&candidate.relevance.episodeDays<=7&&completeAnimeDate(candidate.trendSignals.startDate))Object.assign(item,{estreia:completeAnimeDate(candidate.trendSignals.startDate),ano:String(candidate.trendSignals.startDate.year),discoveryDateSource:'AniList'});
     items.push(item);
    }else{detailFailures.set(candidate.id,result.reason?.status===404?'catalog-detail-not-found':'catalog-detail-unavailable');if(result.reason?.status!==404)partial=true;}
   }
  }
  if(!items.length&&partial)throw Error('DISCOVERY_UNAVAILABLE');
  const activeIds=new Set(items.map(item=>item.id));
  const sourceDiagnostics=candidates.filter(item=>!activeIds.has(item.id)).map(item=>{
   const rankedItem=current.find(row=>row.id===item.id),row=animeSelectionDiagnostic(rankedItem||{...item,relevance:analyzeAnimeRelevance(item,{now})},{});
   if(detailFailures.has(item.id))row.reasons.push(detailFailures.get(item.id));
   else if(rankedItem?.relevance.eligible)row.reasons.push('candidate-budget-limit');
   return row;
  });
  const returned=sourceStats.reduce((sum,row)=>sum+(row.returned||0),0),funnel={sourceRows:returned,uniqueCandidates:candidates.length,duplicateOrInvalidRows:returned-candidates.length,currentCandidates:current.length,removedByCurrentOrFranchise:candidates.length-current.length,activityEligible:eligible.length,removedByActivity:current.length-eligible.length,removedByCandidateBudget:eligible.length-ranked.length,detailsRequested:Math.min(ranked.length,ANIME_TREND_RULES.maxDetails),detailFailures:detailFailures.size,hydrated:items.length};
  const currentIds=new Set(current.map(item=>item.id)),eligibleIds=new Set(eligible.map(item=>item.id));
  for(const stat of sourceStats){
   const ids=[...new Set(stat.candidateIds||[])];stat.distinctCandidates=ids.length;
   stat.currentCandidates=ids.filter(id=>currentIds.has(id)).length;
   stat.activityEligible=ids.filter(id=>eligibleIds.has(id)).length;
   stat.hydrated=ids.filter(id=>activeIds.has(id)).length;
   stat.filteredCurrentOrFranchise=ids.length-stat.currentCandidates;
   stat.filteredActivity=stat.currentCandidates-stat.activityEligible;
   delete stat.candidateIds;
  }
  return {hero:items.slice(0,5),trending:items.slice(5),weekly:[],rankedDiscovery:true,sourceDiagnostics,sourceStatus:region.sources||[],sourceStats,funnel,partial,updatedAt:now.toISOString()};
 };
}
export const loadCurrentAnime=createAnimeTrendSource();
