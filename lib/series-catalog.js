import {fetchJson} from './api.js';
import {SERIES_RULES,seriesGenres,seriesGenreNames,essentialSeriesIds} from '../config/series.js';
import {normalizeSeries,seriesAllowed,recognizedSeries,recentSeasons,monthsBefore} from './series-model.js';
import {SEARCH_CACHE_MS,normalizeSearchTerm} from './catalog-cache-policy.js';
import {createSeriesEditorial} from './series-editorial.js';
const cache=new Map(),pending=new Map();
let editorialClients=new WeakMap();
export function clearSeriesCache(){cache.clear();pending.clear();editorialClients=new WeakMap();}
export function seriesEditorial(fetcher=fetchJson){
 if(!editorialClients.has(fetcher))editorialClients.set(fetcher,createSeriesEditorial({resource:(path,params,ttl)=>resource(path,params,fetcher,ttl)}));
 return editorialClients.get(fetcher).get();
}
async function resource(path,params={},fetcher=fetchJson,ttl=SERIES_RULES.cacheMs){
 if(path.startsWith('search/'))ttl=Math.min(ttl,SEARCH_CACHE_MS);
 const canonical=new URLSearchParams(Object.entries({language:'pt-BR',...params}).map(([key,value])=>[key,String(value)]));canonical.sort();
 if(canonical.has('query'))canonical.set('query',normalizeSearchTerm(canonical.get('query')).toLocaleLowerCase('pt-BR'));
 const key=path+'?'+canonical,cached=cache.get(key);
 if(cached?.expires>Date.now())return cached.data;if(pending.has(key))return pending.get(key);
 const apiKey=process.env.TMDB_API_KEY;if(!apiKey||apiKey==='cole_sua_chave_aqui')throw Error('CONFIG');
 const url=new URL('https://api.themoviedb.org/3/'+path);Object.entries({language:'pt-BR',...params,api_key:apiKey}).forEach(([key,value])=>url.searchParams.set(key,String(value)));
 const task=fetcher(url).then(data=>{if(cache.size>=400)cache.delete(cache.keys().next().value);cache.set(key,{data,expires:Date.now()+ttl});return data;}).finally(()=>pending.delete(key));pending.set(key,task);return task;
}
export {resource as seriesResource};
export function seriesRequest(section,page=1,genres=''){
 if(!Number.isInteger(page)||page<1||page>500)throw Error('INVALID');
 const theme=seriesGenres.find(theme=>theme.key===section);
 if(!['hero','trending','weekly','editorial','new-episodes','airing','new-seasons','acclaimed','gems','essentials','recommended'].includes(section)&&!theme)throw Error('INVALID');
 if(section==='recommended'&&(!/^\d+(?:\|\d+){0,2}$/.test(genres)||genres.split('|').some(id=>!Object.hasOwn(seriesGenreNames,id))))throw Error('INVALID');
 const path=['hero','trending'].includes(section)?'trending/tv/week':section==='airing'?'tv/on_the_air':'discover/tv',params={page,include_adult:false};
 if(path==='discover/tv'){params.sort_by='popularity.desc';params['vote_count.gte']=25;params['first_air_date.lte']=new Date().toISOString().slice(0,10);if(SERIES_RULES.excludeAnime)params.without_keywords='210024';}
 if(theme?.genre||theme?.genres)params.with_genres=theme.genres||theme.genre;
 if(section==='recommended'){params.with_genres=genres;params['vote_count.gte']=100;}
 if(section==='acclaimed'){params['vote_average.gte']=SERIES_RULES.acclaimed.rating;params['vote_count.gte']=SERIES_RULES.acclaimed.minVotes;params.sort_by='vote_average.desc';}
 return {path,params,theme};
}
async function seriesDetails(ids,fetcher){
 const rows=[];let partial=false;const unique=[...new Set(ids.map(String))];
 for(let offset=0;offset<unique.length;offset+=5){const results=await Promise.allSettled(unique.slice(offset,offset+5).map(id=>resource(`tv/${id}`,{append_to_response:'keywords'},fetcher)));for(const result of results){if(result.status==='rejected')partial=true;else rows.push(result.value);}}
 return {rows,partial};
}
async function newSeasons(fetcher,today){
 const rules=SERIES_RULES.seasons,details=new Map();let partial=false,movies=[],windowMonths=rules.windows[0];
 for(const months of rules.windows){
  const candidates=[];windowMonths=months;
  for(let page=1;page<=rules.candidatePages;page++){
   const data=await resource('discover/tv',{page,include_adult:false,sort_by:'popularity.desc','vote_average.gte':rules.minRating,'vote_count.gte':rules.minVotes,'air_date.gte':monthsBefore(today,months),'air_date.lte':today,'first_air_date.lte':today,without_genres:'10763,10764,10766,10767',...(SERIES_RULES.excludeAnime?{without_keywords:'210024'}:{})},fetcher);
   candidates.push(...(data.results||[]).filter(recognizedSeries));if(page>=(data.total_pages||1))break;
  }
  const loaded=await seriesDetails(candidates.filter(row=>!details.has(String(row.id))).map(row=>row.id),fetcher);partial ||= loaded.partial;for(const row of loaded.rows)details.set(String(row.id),row);
  movies=recentSeasons([...details.values()],today,months);
  if(movies.length>=rules.target)break;
 }
 // Prefer the six-month selection; expand only to fill the remaining relevant slots.
 movies.sort((a,b)=>Number(b.seasonStartDate>=monthsBefore(today,6))-Number(a.seasonStartDate>=monthsBefore(today,6))||b.seasonScore-a.seasonScore);
 return {movies:movies.slice(0,rules.target),page:1,totalPages:1,windowMonths,partial};
}
async function essentials(fetcher){
 const {rows,partial}=await seriesDetails(essentialSeriesIds,fetcher),rules=SERIES_RULES.essentials;
 const movies=rows.filter(row=>seriesAllowed(row)&&row.vote_average>=rules.minRating&&row.vote_count>=rules.minVotes).sort((a,b)=>essentialScore(b)-essentialScore(a)).map(normalizeSeries);
 function essentialScore(row){return row.vote_average+0.4*Math.log10(row.vote_count+1)+0.12*Math.log10((row.popularity||0)+1);}
 return {movies,page:1,totalPages:1,partial};
}
export async function seriesMetadata(ids,{fetcher=fetchJson}={}){
 const unique=[...new Set(ids.map(String))];if(unique.length>20||unique.some(id=>!/^[1-9]\d{0,9}$/.test(id)))throw Error('INVALID');
 const items=[];let partial=false;
 for(let offset=0;offset<unique.length;offset+=5){const results=await Promise.allSettled(unique.slice(offset,offset+5).map(async id=>{const row=await resource(`tv/${id}`,{append_to_response:'keywords'},fetcher);return seriesAllowed(row)?normalizeSeries(row):null;}));for(const result of results){if(result.status==='rejected')partial=true;else if(result.value)items.push(result.value);}}
 return {items,partial};
}
export async function getSeriesSection(section,page=1,{genres='',fetcher=fetchJson,today=new Date().toISOString().slice(0,10)}={}){
 const {path,params,theme}=seriesRequest(section,page,genres);
 if(['hero','trending','weekly','editorial','new-episodes'].includes(section)){
  if(page!==1)return section==='editorial'?{hero:[],trending:[],weekly:[],episodes:[],page,totalPages:1}:section==='new-episodes'?{episodes:[],page,totalPages:1}:{movies:[],page,totalPages:1};
  const edition=await seriesEditorial(fetcher);
  if(section==='editorial')return {hero:edition.hero,trending:edition.trending,weekly:edition.weekly,generatedAt:edition.generatedAt,expiresAt:edition.expiresAt,partial:edition.partial,stale:edition.stale};
  if(section==='new-episodes')return {episodes:edition.episodes,windowDays:edition.windowDays,partial:edition.partial,stale:edition.stale};
  return {movies:edition[section],page,totalPages:1,partial:edition.partial,stale:edition.stale};
 }
 if(['new-seasons','airing','essentials','gems'].includes(section)){if(page!==1)return {movies:[],page,totalPages:1};return ['new-seasons','airing'].includes(section)?newSeasons(fetcher,today):essentials(fetcher);}
 if(theme?.keyword){const keywords=await resource('search/keyword',{query:theme.keyword},fetcher),match=keywords.results?.find(row=>row.name.toLowerCase()===theme.keyword);if(!match)return {movies:[],page,totalPages:1};params.with_keywords=match.id;}
 const raw=await resource(path,params,fetcher),items=(raw.results||[]).filter(seriesAllowed).map(normalizeSeries);
 return {movies:items,page,totalPages:Math.min(raw.total_pages||1,500),partial:false};
}
export async function searchSeries(options,{fetcher=fetchJson}={}){
 let page=options.page,offset=options.offset,next=null;const movies=[];
 for(let requests=0;requests<3;requests++){
  const params={include_adult:false,page};if(options.q)params.query=options.q;else{params.sort_by='popularity.desc';if(options.genre!=='all')params.with_genres=options.genre;}
  if(options.year)params.first_air_date_year=options.year;
  const data=await resource(options.q?'search/tv':'discover/tv',params,fetcher),lastPage=Math.min(data.total_pages||1,500),results=data.results||[];
  if(page>lastPage)break;
  const candidates=results.slice(offset).filter(seriesAllowed).filter(row=>options.genre==='all'||row.genre_ids?.includes(Number(options.genre)));
  const metadata=await seriesMetadata(candidates.map(row=>row.id),{fetcher});if(metadata.partial)throw Error('UPSTREAM');const allowed=new Map(metadata.items.map(item=>[String(item.id),item]));
  for(;offset<results.length;offset++){const item=allowed.get(String(results[offset].id));if(item)movies.push(item);if(movies.length===20){offset++;break;}}
  if(offset>=results.length){page++;offset=0;}next=page<=lastPage?`${page}:${offset}`:null;if(movies.length===20||!next)break;
 }
 return {movies,next};
}
