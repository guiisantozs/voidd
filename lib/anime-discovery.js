import {enrichAnimeArtwork} from './anime-artwork.js';
import {loadCurrentAnime} from './anime-trend-source.js';
import {publicAnimeDiscoveryItem,analyzeAnimeRelevance} from './anime-relevance.js';
export function animeDiscoveryCacheMs(){const hours=Number(process.env.VOID_ANIME_DISCOVERY_CACHE_HOURS||6);return (Number.isFinite(hours)?Math.max(6,Math.min(12,hours)):6)*3600000;}
export function createAnimeDiscovery({load=loadCurrentAnime,enrich=enrichAnimeArtwork,clock=()=>Date.now(),ttl=21600000}={}){
 let cached=null,pending=null,expires=0,retryAt=0,lastError=null;
 function lastGood(){
  const data=structuredClone(cached),checked=new Map();
  for(const section of ['hero','weekly','trending'])data[section]=(data[section]||[]).filter(item=>{
   if(item.categoria!=='animes')return true;
   const analysis=analyzeAnimeRelevance(item,{now:new Date(clock())});analysis.confidence*=.75;item.relevance=analysis;checked.set(item.id,analysis);
   return section==='trending'?analysis.trendingEligible:analysis.eligible;
  });
  data.diagnostics=(data.diagnostics||[]).map(row=>{
   const analysis=checked.get(row.id);if(!analysis)return row;
   const selectedSections=['hero','weekly','trending'].filter(section=>data[section].some(item=>item.id===row.id)),selected=selectedSections[0]||'none';
   return {...row,analysis,selected,selectedSections,reasons:[...analysis.reasons,'using-last-good-edition',...(selected==='none'?['last-good-no-longer-eligible']:[])]};
  });
  if(data.funnel)data.funnel={...data.funnel,hero:data.hero.length,weekly:data.weekly.length,trending:data.trending.length,staleRevalidation:true};
  return {...data,stale:true};
 }
 async function edition(){
  if(cached&&clock()<expires)return structuredClone(cached);
  if(clock()<retryAt){if(cached&&clock()-expires<86400000)return lastGood();throw lastError||Error('DISCOVERY_UNAVAILABLE');}
  if(pending)return pending.then(structuredClone);
  pending=(async()=>{try{
   const result=await enrich(await load());if(!Array.isArray(result.hero))throw Error('DISCOVERY_UNAVAILABLE');
   cached=result;lastError=null;expires=clock()+(result.partial?300000:ttl);return structuredClone(result);
  }catch(error){lastError=error;retryAt=clock()+60000;if(cached&&clock()-expires<86400000)return lastGood();throw error;}finally{pending=null;}})();
  return pending;
 }
 return {async diagnostics(){const data=await edition();return structuredClone(data.diagnostics||[]);},async diagnosticReport(){const data=await edition();return {updatedAt:data.updatedAt,stale:!!data.stale,sources:data.sourceStatus||[],sourceStats:data.sourceStats||[],funnel:data.funnel||{},candidates:data.diagnostics||[]};},async section(section,page=1){
  if(!['editorial','trending','hero','weekly'].includes(section)||!Number.isInteger(page)||page<1||page>500)throw Error('INVALID');
  const data=await edition();delete data.diagnostics;delete data.sourceDiagnostics;delete data.sourceStatus;delete data.sourceStats;delete data.funnel;delete data.rankedDiscovery;for(const key of ['hero','weekly','trending'])if(Array.isArray(data[key]))data[key]=data[key].map(publicAnimeDiscoveryItem);if(section==='editorial')return data;
  const rows=data[section]||[],totalPages=Math.max(1,Math.ceil(rows.length/20));return {movies:rows.slice((page-1)*20,page*20),page,totalPages,hasNext:page<totalPages,partial:!!data.partial,stale:!!data.stale,discoveryNote:data.discoveryNote,reference:data.reference,updatedAt:data.updatedAt,artworkVersion:data.artworkVersion,discoveryVersion:data.discoveryVersion};
 }};
}
export const animeDiscovery=createAnimeDiscovery({ttl:animeDiscoveryCacheMs()});
