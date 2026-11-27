import {seriesResource} from './series-catalog.js';
import {aniListArtwork} from './anilist-artwork.js';
import {fanartArtwork} from './fanart-artwork.js';
import {ANIME_ARTWORK_VERSION,animeHeroEligible,bestAnimeImage} from './anime-artwork-policy.js';
import {animeDiscoveryNote} from '../config/anime-discovery.js';
import {withAnimeDisplayTitle} from './anime-titles.js';
import {rankCurrentAnime,distributeCurrentAnime,ANIME_TREND_RULES,completeAnimeDate,brazilFocusedCandidate,analyzeAnimeRelevance,animeSelectionDiagnostic} from './anime-relevance.js';

const DAY=86400000;
const titleKey=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const titles=item=>[item.titulo,item.originalTitle,item.englishTitle].map(titleKey).filter(Boolean);
const imagePath=value=>typeof value==='string'&&/^\/[\w-]+\.(jpg|png|webp)$/.test(value)?value:null;

// MAL cards frequently contain a resized thumbnail. Request the existing large
// variant only on MAL's known anime CDN paths, retaining the supplied fallback.
export function largeAnimePoster(value){
 try{const url=new URL(value);if(url.protocol!=='https:'||url.hostname!=='cdn.myanimelist.net')return value;
  const path=url.pathname.replace(/^\/r\/\d+x\d+\//,'/');
  if(!/^\/images\/anime\/\d+\/\d+l?\.(jpg|webp)$/.test(path))return value;
  url.pathname=path.replace(/(\d+)l?\.(jpg|webp)$/,'$1l.$2');return url.href;
 }catch{return value;}
}
export function matchingArtwork(item,rows){
 const names=titles(item),year=Number(item.ano);if(!year||!names.length||!['Movie','TV','ONA'].includes(item.format))return null;
 const matches=rows.filter(row=>!row.adult&&(row.genre_ids||[]).includes(16)&&row.original_language==='ja'&&
  (item.format==='Movie'?row.media_type==='movie':row.media_type==='tv')&&
  Number((row.first_air_date||row.release_date||'').slice(0,4))===year&&
  [row.name,row.title,row.original_name,row.original_title].some(name=>name&&names.includes(titleKey(name))));
 const unique=[...new Map(matches.map(row=>[`${row.media_type}:${row.id}`,row])).values()];
 if(unique.length!==1)return null;
 const row=unique[0],posterPath=imagePath(row.poster_path),backdropPath=imagePath(row.backdrop_path);
 return posterPath||backdropPath?{...(posterPath?{posterPath,poster:`https://image.tmdb.org/t/p/w780${posterPath}`} :{}),
  ...(backdropPath?{backdropPath,backdrop:`https://image.tmdb.org/t/p/w1280${backdropPath}`} :{}),artworkProvider:'tmdb',artworkTmdbId:row.id,artworkMedia:row.media_type}:null;
}

export function createAnimeArtwork({resource=(path,params,ttl=DAY)=>seriesResource(path,params,undefined,ttl),fanart=fanartArtwork,clock=()=>Date.now()}={}){
 const cache=new Map(),pending=new Map();let unavailableUntil=0,poolUnavailableUntil=0;
 function cached(key,load){
  const hit=cache.get(key);if(hit?.until>clock())return Promise.resolve(hit.value);if(pending.has(key))return pending.get(key);
  const task=load().then(value=>{if(cache.size>=400)cache.delete(cache.keys().next().value);cache.set(key,{value,until:clock()+(key!=='pool'&&value?.poster&&value?.backdrop?DAY:3600000)});return value;}).finally(()=>pending.delete(key));pending.set(key,task);return task;
 }
 function pool(){return cached('pool',async()=>{
  let provider=null;try{const data=await resource('watch/providers/tv',{watch_region:'BR',language:'en-US'});provider=(data.results||[]).find(row=>row.provider_name==='Crunchyroll')?.provider_id;}catch{/* Keep a labelled general-interest fallback. */}
  const pages=await Promise.all(['tv','tv','tv','movie'].map(async(type,index)=>{
   const data=await resource(`discover/${type}`,{language:'en-US',with_genres:16,with_original_language:'ja',include_adult:false,sort_by:'popularity.desc',page:type==='tv'?index+1:1,...(provider?{watch_region:'BR',with_watch_providers:provider}:{})},3600000);return (data.results||[]).map(row=>({...row,media_type:type,crunchyrollBrazil:!!provider}));
  }));return pages.flat();
 });}
 async function one(item,initial,rows){
  const art=await cached(`anime:${item.id}`,async()=>{
   const type=item.format==='Movie'?'movie':'tv',found=[];let match=initial;
   for(const query of (match?[]:[...new Set([item.englishTitle,item.titulo].filter(Boolean))].slice(0,2))){
    const data=await resource(`search/${type}`,{language:'en-US',query,include_adult:false,page:1});found.push(...(data.results||[]).map(row=>({...row,media_type:type})));
    match=matchingArtwork(item,found);if(match)break;
   }
   let franchise=false;
   if(!match){
    // A sequel may be a MAL production but a season under a TMDB series.
    // Follow an explicit provider relation, never strip words from its title.
    const related=[...(item.trendSignals?.relations||[]).filter(row=>row.relation==='PREQUEL').map(row=>row.artwork),...item.franchiseReferences||[]].filter(row=>row?.id!==item.id&&row?.format==='TV'&&type==='tv');
    for(const relation of related.slice(0,8).map(artwork=>({artwork}))){
     match=matchingArtwork(relation.artwork,rows);if(match){franchise=true;break;}
    }
    if(!match)for(const root of related.slice(0,2)){
     const data=await resource('search/tv',{language:'en-US',query:root.englishTitle||root.titulo,include_adult:false,page:1});
     match=matchingArtwork(root,(data.results||[]).map(row=>({...row,media_type:'tv'})));if(match){franchise=true;break;}
    }
   }
   if(!match)return {artworkMatchStatus:'no-verified-tmdb-match'};
   const result={artworkTmdbId:match.artworkTmdbId,artworkMedia:type};let details;
   try{
    details=await resource(`${type}/${match.artworkTmdbId}`,{append_to_response:'images,external_ids',include_image_language:'pt,en,ja,null'});
    if(Number(details.id)!==match.artworkTmdbId)throw Error('ARTWORK_IDENTITY');
    try{
     const providers=await resource(`${type}/${match.artworkTmdbId}/watch/providers`,{},21600000),br=providers.results?.BR,offers=[...br?.flatrate||[],...br?.free||[],...br?.ads||[]];
     if(franchise)result.brazilFranchiseAvailable=offers.length>0;else result.brazilAvailable=offers.length>0;
     result.crunchyrollBrazil=offers.some(row=>row.provider_name==='Crunchyroll');
    }catch{/* Missing regional evidence never becomes a Brazilian audience claim. */}
    let images=details.images||{},poster;
    if(details.overview?.trim())Object.assign(result,{synopsisTmdbPt:details.overview,synopsisScope:franchise?'series':'production'});
    if(franchise){
     const premiere=completeAnimeDate(item.trendSignals?.startDate)||completeAnimeDate(item.estreia),seasons=(details.seasons||[]).filter(row=>row.season_number>0&&premiere&&completeAnimeDate(row.air_date)&&row.air_date.slice(0,4)===premiere.slice(0,4)&&Math.abs(Date.parse(row.air_date)-Date.parse(premiere))<=45*86400000);
     result.backdropScope='verified-franchise';
     if(seasons.length===1){
      result.artworkSeasonNumber=seasons[0].season_number;result.backdropScope='verified-franchise-season';
      if(seasons[0].overview?.trim())Object.assign(result,{synopsisTmdbPt:seasons[0].overview,synopsisScope:'production'});
      try{const gallery=await resource(`tv/${match.artworkTmdbId}/season/${seasons[0].season_number}/images`,{include_image_language:'pt,en,ja,null'});poster=bestAnimeImage((gallery.posters||[]).filter(row=>imagePath(row.file_path)),'poster');}catch{/* Keep the production's own cover if a season gallery is unavailable. */}
     }
     if(seasons.length===1&&details.name&&seasons[0].name)result.localizedTitle=details.name+' · '+seasons[0].name;
    }else{
     poster=bestAnimeImage((images.posters||[]).filter(row=>imagePath(row.file_path)),'poster');
     if(details.name||details.title)result.localizedTitle=details.name||details.title;
    }
    const backdrop=bestAnimeImage((images.backdrops||[]).filter(row=>imagePath(row.file_path)),'backdrop');
    if(poster)Object.assign(result,{posterPath:poster.file_path,poster:`https://image.tmdb.org/t/p/original${poster.file_path}`,posterWidth:poster.width,posterHeight:poster.height,posterProvider:'tmdb'});
    if(backdrop)Object.assign(result,{backdropPath:backdrop.file_path,backdrop:`https://image.tmdb.org/t/p/original${backdrop.file_path}`,backdropWidth:backdrop.width,backdropHeight:backdrop.height,backdropProvider:'tmdb'});
   }catch{if(franchise)return {...result,artworkMatchStatus:'franchise-gallery-unavailable'};details=null;/* Optional artwork failure never hides catalogue data. */}
   if(fanart.enabled()&&(!result.poster||!result.backdrop)){
    const extra=await fanart.get({type,tmdbId:match.artworkTmdbId,tvdbId:details?.external_ids?.tvdb_id});
    if(!franchise&&!result.poster&&extra.poster)Object.assign(result,{poster:extra.poster,posterPath:null,posterProvider:'fanart'});
    if(!result.backdrop&&extra.backdrop)Object.assign(result,{backdrop:extra.backdrop,backdropPath:null,backdropWidth:extra.backdropWidth,backdropHeight:extra.backdropHeight,backdropProvider:'fanart'});
   }
   return result;
  });return {...item,...art};
 }
 return {
  async items(items,{detail=false}={}){
   if(!items.length)return items;
   if(clock()<unavailableUntil)return items.map(item=>({...item,artworkMatchStatus:'provider-cooldown'}));
   let rows=[];try{if(clock()>=poolUnavailableUntil)rows=await pool();}catch{poolUnavailableUntil=clock()+60000;}
   return Promise.all(items.map(async item=>{
    const match=matchingArtwork(item,rows);
    if(!detail){
     const references=[...item.franchiseReferences||[],...(item.trendSignals?.relations||[]).filter(row=>['PREQUEL','SEQUEL','ALTERNATIVE'].includes(row.relation)).map(row=>row.artwork)].filter(Boolean),regionalFamily=references.some(ref=>{const linked=matchingArtwork(ref,rows);return linked&&rows.some(row=>row.id===linked.artworkTmdbId&&row.media_type===linked.artworkMedia&&row.crunchyrollBrazil);});
     if(!match)return {...item,brazilFranchiseAvailable:regionalFamily};const hit=cache.get(`anime:${item.id}`),row=rows.find(row=>row.id===match.artworkTmdbId&&row.media_type===match.artworkMedia);return {...item,...(match.posterPath?{poster:match.poster,posterPath:match.posterPath,posterProvider:'tmdb'}:{}),artworkTmdbId:match.artworkTmdbId,crunchyrollBrazil:!!row?.crunchyrollBrazil,brazilFranchiseAvailable:regionalFamily,discoveryPopularity:row?.popularity||0,...(hit?.until>clock()?hit.value:{})};}
    try{return await one(item,match,rows);}catch(error){
     if(error.status===429)unavailableUntil=clock()+Math.max(60,error.retryAfter||0)*1000;
     const value={artworkMatchStatus:'lookup-failed',artworkFailureCode:error.status||error.name||'unknown'};
     if(cache.size>=400)cache.delete(cache.keys().next().value);
     cache.set('anime:'+item.id,{value,until:clock()+60000});
     return {...item,...value};
    }
   }));
  }
 };
}
const artwork=createAnimeArtwork();
export async function enrichAnimeArtwork(data){
 async function enrich(items,detail=false){
  const fallback=await aniListArtwork.items(items),clean=fallback.map(item=>({...item,backdrop:null,backdropPath:null,backdropFallback:null,backdropProvider:null,backdropWidth:null,backdropHeight:null,posterProvider:item.artworkProvider==='anilist'?'anilist':'myanimelist',artworkVersion:ANIME_ARTWORK_VERSION}));
  return artwork.items(clean,{detail});
 }
 if(Array.isArray(data))return (await enrich(data)).map(withAnimeDisplayTitle);
 if(!data||typeof data!=='object')return data;
 if(data.categoria==='animes'){
  return withAnimeDisplayTitle((await enrich([data],true))[0]);
 }
 const result={...data};
 const keys=['movies','items','hero','trending','weekly'].filter(key=>Array.isArray(result[key])),all=keys.flatMap(key=>result[key]),loaded=await enrich(all),byId=new Map(loaded.map(item=>[item.id,item]));
 for(const key of keys)result[key]=result[key].map(item=>withAnimeDisplayTitle(byId.get(item.id)||item));
 if(data.rankedDiscovery){
  const now=new Date(data.updatedAt);let scored=rankCurrentAnime([...byId.values()],{now});const resolved=[],qualified=[];
  for(let offset=0;offset<Math.min(scored.length,ANIME_TREND_RULES.maxArtwork);offset+=12){
   const loaded=await artwork.items(scored.slice(offset,offset+12),{detail:true}),batch=loaded.map(item=>({...item,relevance:analyzeAnimeRelevance(item,{now})}));
   resolved.push(...batch.map(withAnimeDisplayTitle));qualified.push(...batch.filter(item=>brazilFocusedCandidate(item)&&animeHeroEligible(item)).map(withAnimeDisplayTitle));
   if(qualified.length>=12)break;
  }
  const resolvedById=new Map(resolved.map(item=>[item.id,item]));
  scored=rankCurrentAnime([...byId.values()].map(item=>withAnimeDisplayTitle(resolvedById.get(item.id)||item)),{now});const ranked=scored.filter(brazilFocusedCandidate);
  Object.assign(result,distributeCurrentAnime(ranked,qualified),{discoveryNote:animeDiscoveryNote,artworkVersion:ANIME_ARTWORK_VERSION,discoveryVersion:2});
  result.funnel={...data.funnel,artworkExamined:resolved.length,artworkQualified:qualified.length,artworkRejected:resolved.length-qualified.length,hero:result.hero.length,weekly:result.weekly.length,trending:result.trending.length,weeklyWindowDays:result.weeklyWindowDays};
  result.diagnostics=[...(data.sourceDiagnostics||[]),...scored.map(item=>animeSelectionDiagnostic(item,result))];
  delete result.sourceDiagnostics;
  // Fewer eligible titles is an honest result, not an API failure. Do not
  // refill with classics or retry every visitor just to force five slides.
  return result;
 }
 result.artworkVersion=ANIME_ARTWORK_VERSION;
 return result;
}
