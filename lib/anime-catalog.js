import {animeId,decodeAnimeId} from './anime-provider.js';
import {reserveGlobalBudget} from './global-provider-budget.js';
import {animeGenres,animeGenreNames} from '../config/animes.js';
import {normalizeSearchTerm,SEARCH_CACHE_MS} from './catalog-cache-policy.js';
import {consumptionError,retryAfterSeconds} from './provider-guard.js';
import {resourceMetrics} from './resource-metrics.js';
import {selectEpisodeHighlights,latestRecentEpisode} from './episode-releases.js';
import {jikanEndpoint} from './jikan-endpoint.js';
import {JIKAN_EDGE_URL,edgeRequest,edgeResponse} from './jikan-edge.js';
import {largeAnimePoster} from './anime-artwork.js';
import {localizedAnimeQuery} from '../config/anime-discovery.js';
import {animeCache,ANIME_TTL,reserveAnimeApiSlot,animeStorage} from './anime-cache.js';
const DAY=86400000;
export function animeResourceTtl(path,payload,ttl=ANIME_TTL.static){return /^anime\/\d+\/full$/.test(path)&&payload?.data?.status==='Currently Airing'?Math.min(ttl,ANIME_TTL.airing):ttl;}
const safeUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'?u.href:null;}catch{return null;}};
export const animeAllowed=row=>animeId(row?.mal_id)!==null&&!/^Rx|^R\+/.test(row.rating||'')&&!(row.genres||[]).some(g=>[12,49].includes(g.mal_id));
export function normalizeAnime(row){
 const posterFallback=safeUrl(row.images?.webp?.large_image_url||row.images?.jpg?.large_image_url||row.images?.jpg?.image_url),poster=largeAnimePoster(posterFallback),score=Number.isFinite(row.score)&&(row.scored_by>0||row.score>0)?row.score:null;
 return {id:animeId(row.mal_id),provider:row.catalogProvider||'jikan',providerId:row.mal_id,malId:row.mal_id,categoria:'animes',titulo:row.title||row.title_english||'Título não informado',originalTitle:row.title_japanese||'',englishTitle:row.title_english||'',poster,
  posterFallback,backdrop:null,backdropFallback:null,sinopse:row.synopsis||'',ano:String(row.year||row.aired?.from?.slice(0,4)||''),estreia:row.aired?.from?.slice(0,10)||null,
  nota:score===null?null:score/2,externalRating:score,externalVoteCount:row.scored_by??null,externalRatingSource:'MyAnimeList',genreIds:(row.genres||[]).map(g=>g.mal_id),generos:(row.genres||[]).map(g=>animeGenreNames[g.mal_id]||g.name),
  format:row.type||null,numberOfEpisodes:row.episodes??null,releaseStatus:({'Not yet aired':'Planned','Currently Airing':'Returning Series','Finished Airing':'Ended'})[row.status]||null,statusLabel:({'Not yet aired':'Anunciado','Currently Airing':'Em exibição','Finished Airing':'Finalizado'})[row.status]||row.status||'',fonte:row.catalogProvider==='jikan-edge'?'Jikan-Edge / MyAnimeList':'Jikan / MyAnimeList',fonteUrl:`https://myanimelist.net/anime/${row.mal_id}`};
}
// One shared cache and queue per server instance, bounded and public only.
// Rolling limits avoid fixed-minute bursts. No retries on a provider 429.
export function createAnimeClient({baseUrl=JIKAN_EDGE_URL,protocol='edge',fetcher=(...args)=>fetch(...args),clock=()=>Date.now(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),spacing=350,reserve=async()=>{},block=async()=>{}}={}){
 const cache=new Map(),pending=new Map(),starts=[];let tail=Promise.resolve(),last=-Infinity,blockedUntil=0,queued=0;
 function resource(path,params={},ttl=DAY,{fresh=false}={}){
  if(!/^(?:anime(?:\/[1-9]\d{0,8}(?:\/(?:full|episodes(?:\/[1-9]\d{0,4})?|recommendations|relations|characters|staff|pictures))?)?|top\/anime|seasons\/(?:now|upcoming))$/.test(path))return Promise.reject(Error('INVALID'));
  const search=new URLSearchParams(Object.entries(protocol==='edge'?edgeRequest(path,params):params).map(([k,v])=>[k,String(v)]));search.sort();const key=path+'?'+search,cached=cache.get(key);
  if(!fresh&&cached?.expires>clock()){resourceMetrics.record('jikan','hits');return Promise.resolve(structuredClone(cached.data));}
  if(pending.has(key)){resourceMetrics.record('jikan','deduplicated');return pending.get(key).then(data=>structuredClone(data));}
  if(queued>=24)return Promise.reject(consumptionError(503,2));
  queued++;
  const task=tail.catch(()=>{}).then(async()=>{
   if(clock()<blockedUntil)throw consumptionError(429,Math.ceil((blockedUntil-clock())/1000));
   while(starts.length&&starts[0]<=clock()-60000)starts.shift();
   if(starts.length>=60)throw consumptionError(429,Math.ceil((starts[0]+60000-clock())/1000));
   const wait=spacing-(clock()-last);if(wait>0)await sleep(wait);last=clock();starts.push(last);
   await reserveGlobalBudget('jikan');await reserve();const started=clock();
   try{
   const response=await fetcher(`${baseUrl}/${key}`,{signal:AbortSignal.timeout(10000),headers:{Accept:'application/json'}});
   if(!response.ok){const retry=retryAfterSeconds(response.headers?.get('Retry-After'));if(response.status===429){blockedUntil=clock()+retry*1000;await block(retry).catch(()=>{});}throw Object.assign(Error('JIKAN_UNAVAILABLE'),{status:response.status,retryAfter:response.status===429?retry:undefined});}
   const raw=await response.json(),data=protocol==='edge'?edgeResponse(path,raw):raw;if(!data||!Object.hasOwn(data,'data'))throw Error('SOURCE');
   const lifetime=animeResourceTtl(path,data,ttl);if(cache.size>=400)cache.delete(cache.keys().next().value);cache.set(key,{data,expires:clock()+(data.stale?Math.min(lifetime,60000):lifetime)});return structuredClone(data);
   }catch(error){resourceMetrics.record('jikan',error.status===429?'limited':'errors');throw error;}
   finally{resourceMetrics.record('jikan','requests',clock()-started);}
  }).finally(()=>{queued--;pending.delete(key);});
  // Release the queue after this response so at most one request is active.
  tail=task;pending.set(key,task);return task;
 }
 return {resource,clear(){cache.clear();if(!queued){starts.length=0;last=-Infinity;blockedUntil=0;}}};
}
let client,clientEndpoint;
export const clearAnimeCache=()=>client?.clear();
export function animeResource(...args){
 try{
  if(process.env.ANIME_CATALOG_PROVIDER==='disabled')throw Object.assign(Error('CONFIG'),{status:503});
  const provider=process.env.ANIME_CATALOG_PROVIDER||'jikan-edge';if(!['jikan-edge','jikan'].includes(provider))throw Error('CONFIG');
  const protocol=provider==='jikan-edge'?'edge':'jikan',endpoint=jikanEndpoint(provider==='jikan-edge'?process.env.JIKAN_EDGE_BASE_URL||JIKAN_EDGE_URL:process.env.JIKAN_API_BASE_URL),identity=`${protocol}:${endpoint}`;
  if(!client||clientEndpoint!==identity){client=createAnimeClient({baseUrl:endpoint,protocol,reserve:reserveAnimeApiSlot,block:seconds=>animeStorage.slot(seconds)});clientEndpoint=identity;}
  const [path,params={},ttl=ANIME_TTL.static]=args;
  if(!/^anime\/[1-9]\d*(?:\/(?:full|characters|staff|episodes(?:\/\d+)?|recommendations))?$/.test(path))return client.resource(...args);
  return animeCache.get(`resource:v1:${identity}:${path}?${new URLSearchParams(params)}`,async()=>compactAnimeResource(path,await client.resource(path,params,ttl,{fresh:true})),{ttl:payload=>animeResourceTtl(path,payload,ttl)});
 }catch(error){return Promise.reject(error);}
}
function compactAnimeResource(path,result){
 const pick=(row,keys)=>Object.fromEntries(keys.filter(key=>row[key]!==undefined).map(key=>[key,row[key]]));
 const keys=/\/characters$/.test(path)?['character','role','voice_actors']:/\/staff$/.test(path)?['person','positions']:/\/recommendations$/.test(path)?['entry','votes']:/\/episodes(?:\/\d+)?$/.test(path)?['mal_id','title','title_japanese','aired','duration','synopsis','filler','recap']:['mal_id','catalogProvider','title','title_english','title_japanese','images','synopsis','type','episodes','status','aired','year','score','scored_by','genres','themes','studios','producers','source','duration','rating','trailer','relations','streaming','theme','broadcast'];
 return {...result,data:Array.isArray(result.data)?result.data.map(row=>pick(row,keys)):pick(result.data,keys)};
}
export async function getAnimeSection(section,page=1,{resource=animeResource,genres='',discovery,now=new Date()}={}){
 if(!Number.isInteger(page)||page<1||page>500)throw Error('INVALID');
 if(['editorial','trending','hero','weekly'].includes(section))return (discovery||(await import('./anime-discovery.js')).animeDiscovery).section(section,page);
 if(section==='new-episodes'){
  const current=await getAnimeSection('new-seasons',1,{resource}),rows=[];let partial=false;
  // A small, lazy sample of currently airing productions. No whole catalogue
  // hydration. The last page is requested only when pagination confirms it.
  const today=new Date().toISOString().slice(0,10);
  for(const show of current.movies.filter(item=>(item.releaseStatus==='Returning Series'||item.estreia&&item.estreia<=today)&&item.format!=='Movie').slice(0,3)){
   try{
    const mal=decodeAnimeId(show.id),first=await resource(`anime/${mal}/episodes`,{page:1},3600000),last=first.pagination?.last_visible_page;
    const response=last>1?await resource(`anime/${mal}/episodes`,{page:last},3600000):first;
    const episode=latestRecentEpisode((response.data||[]).map(row=>normalizeAnimeEpisode(row,show.id)),{media:'animes'});if(episode)rows.push({series:show,episode});
   }catch{partial=true;}
  }
  return {...selectEpisodeHighlights(rows,{media:'animes'}),partial};
 }
 const theme=animeGenres.find(g=>g.key===section);let path='anime',params={page,limit:20,sfw:true,genres_exclude:'12,49'};
 if(section==='new-seasons'){path='seasons/now';params={page,limit:20,sfw:true};}
 else if(section==='upcoming'){path='seasons/upcoming';params={page,limit:20,sfw:true};}
 else if(['acclaimed','essentials'].includes(section)){path='top/anime';params={page,limit:20,sfw:true,...(section==='essentials'?{filter:'bypopularity'}:{})};}
 else if(section==='recommended'){
  if(!/^\d+(?:\|\d+){0,2}$/.test(genres)||genres.split('|').some(id=>!animeGenreNames[id]))throw Error('INVALID');
  params={...params,genres:genres.replaceAll('|',','),order_by:'score',sort:'desc',min_score:7};
 }else if(theme)params={...params,genres:theme.genre,order_by:'members',sort:'desc'};else throw Error('INVALID');
 const data=await resource(path,params,3600000);let movies=(data.data||[]).filter(animeAllowed).map(normalizeAnime),totalPages=Math.min(data.pagination?.last_visible_page||(data.pagination?.has_next_page?page+1:page),500);
 const today=now.toISOString().slice(0,10);
 if(section==='upcoming')movies=movies.filter(item=>item.estreia?item.estreia>today:item.releaseStatus==='Planned');
 if(section==='new-seasons')movies=movies.filter(item=>item.releaseStatus!=='Planned'&&item.estreia&&item.estreia<=today);
 if(data.provider==='jikan-edge'&&['new-seasons','upcoming'].includes(section)){totalPages=Math.max(1,Math.ceil(movies.length/20));movies=movies.slice((page-1)*20,page*20);}
 return {movies,page,totalPages,hasNext:page<totalPages,stale:!!data.stale};
}
export async function searchAnime({q='',genre='all',year='',page=1},{resource=animeResource}={}){
 q=normalizeSearchTerm(q);if(q.length===1||q.length>100||!Number.isInteger(page)||page<1||page>500||genre!=='all'&&!animeGenreNames[genre]||year&&(!/^\d{4}$/.test(year)||+year<1874||+year>2099))throw Error('INVALID');
 const params={sfw:true,genres_exclude:'12,49',page,limit:20,order_by:q?'score':'members',sort:'desc',...(q?{q:localizedAnimeQuery(q).toLocaleLowerCase('pt-BR')}:{ }),...(genre!=='all'?{genres:genre}:{}),...(year?{start_date:`${year}-01-01`,end_date:`${year}-12-31`}:{})};
 const data=await resource('anime',params,SEARCH_CACHE_MS);return {movies:(data.data||[]).filter(animeAllowed).map(normalizeAnime),next:data.pagination?.has_next_page?`${page+1}:0`:null,pagination:{page,hasNext:!!data.pagination?.has_next_page}};
}
export async function getAnimeDetail(id,{resource=animeResource}={}){
 const mal=decodeAnimeId(id);if(!mal)throw Error('INVALID');const {data:row}=await resource(`anime/${mal}/full`);if(Number(row?.mal_id)!==mal||!animeAllowed(row))throw Object.assign(Error('NOT_FOUND'),{status:404});
 const item=normalizeAnime(row),date=item.estreia,unit={id:mal,seriesId:Number(id),seasonNumber:1,episodeNumber:0,name:`${row.type||'Produção'} · ${item.titulo}`,airDate:date,episodeCount:row.episodes??0,poster:item.poster,overview:row.synopsis||'',sourceDefined:true};
 return {...item,isAnime:true,sourceDefinedParts:true,seasons:row.type==='Movie'?[]:[unit],numberOfSeasons:null,elenco:[],equipe:[],creditos:[],trailer:/^[\w-]{11}$/.test(row.trailer?.youtube_id||'')?row.trailer.youtube_id:null,galeria:[],
  informacoes:[{label:'Título original',valor:row.title_japanese},{label:'Título em inglês',valor:row.title_english},{label:'Formato',valor:row.type},{label:'Status',valor:item.statusLabel},{label:'Estreia',valor:date},{label:'Duração',valor:row.duration},{label:'Estúdios',valor:(row.studios||[]).map(s=>s.name).join(', ')},{label:'Origem',valor:row.source},{label:'Classificação',valor:row.rating}].filter(r=>r.valor),
  related:(row.relations||[]).flatMap(relation=>(relation.entry||[]).filter(e=>e.type==='anime').map(e=>({id:animeId(e.mal_id),titulo:e.name,relation:relation.relation,categoria:'animes'}))),
  themes:(row.themes||[]).map(t=>t.name).filter(Boolean),studios:(row.studios||[]).map(s=>s.name),producers:(row.producers||[]).map(s=>s.name),broadcast:row.broadcast||null,music:row.theme||{openings:[],endings:[]},
  streaming:(row.streaming||[]).map(s=>({name:s.name,url:safeUrl(s.url)})).filter(s=>s.url)};
}
export function normalizeAnimeEpisode(row,id){return {id:row.mal_id,seriesId:Number(id),seasonNumber:1,episodeNumber:row.mal_id,name:row.title||row.title_japanese||`Episódio ${row.mal_id}`,airDate:row.aired?.slice(0,10)||null,airDateTime:row.aired||null,runtime:Number.isFinite(row.duration)?Math.round(row.duration/60):null,overview:row.synopsis||'',still:null,filler:!!row.filler,recap:!!row.recap};}
export async function getAnimeSeason(id,season,{resource=animeResource,page=1}={}){
 if(season!==1||!decodeAnimeId(id)||!Number.isInteger(page)||page<1||page>500)throw Error('INVALID');
 const show=await getAnimeDetail(id,{resource});if(!show.seasons.length)throw Error('INVALID');
 const {data,pagination}=await resource(`anime/${decodeAnimeId(id)}/episodes`,{page},3600000);
 return {...show.seasons[0],episodes:(data||[]).map(row=>normalizeAnimeEpisode(row,id)),page,nextPage:pagination?.has_next_page?page+1:null};
}
export async function getAnimeEpisode(id,episode,{resource=animeResource}={}){
 if(!decodeAnimeId(id)||!Number.isInteger(episode)||episode<1||episode>10000)throw Error('INVALID');
 if(resource===animeResource){const page=await animeCache.peek(`episodes:v1:${id}:${Math.ceil(episode/25)}`),cached=page?.episodes?.find(row=>row.seriesId===Number(id)&&row.episodeNumber===episode);if(cached)return cached;}
 const {data}=await resource(`anime/${decodeAnimeId(id)}/episodes/${episode}`,{},3600000);if(data?.mal_id!==episode)throw Error('SOURCE');return normalizeAnimeEpisode(data,id);
}
export async function getAnimeSimilar(id,{resource=animeResource,page=1}={}){
 const mal=decodeAnimeId(id);if(!mal||!Number.isInteger(page)||page<1||page>500)throw Error('INVALID');
 const {data}=await resource(`anime/${mal}/recommendations`),rows=(data||[]),slice=rows.slice((page-1)*20,page*20);
 // Recommendation entries have artwork and title only. Scores/dates stay absent.
 return {movies:slice.map(({entry})=>entry).filter(row=>row?.mal_id).map(normalizeAnime),page,totalPages:Math.max(1,Math.ceil(rows.length/20))};
}
export async function getAnimeCredits(id,{resource=animeResource}={}){
 const mal=decodeAnimeId(id);if(!mal)throw Error('INVALID');const [characters,staff]=await Promise.all([resource(`anime/${mal}/characters`),resource(`anime/${mal}/staff`)]);
 return {elenco:(characters.data||[]).slice(0,40).flatMap(row=>(row.voice_actors||[]).filter(v=>v.language==='Japanese').slice(0,1).map(v=>({id:v.person.mal_id,nome:v.person.name,papel:row.character.name,foto:safeUrl(v.person.images?.jpg?.image_url)}))),equipe:(staff.data||[]).map(row=>({id:row.person.mal_id,nome:row.person.name,papel:(row.positions||[]).join(', '),foto:safeUrl(row.person.images?.jpg?.image_url)}))};
}
export async function animeMetadata(ids,{resource=animeResource}={}){
 const unique=[...new Set(ids.map(String))];if(unique.length>20||unique.some(id=>!decodeAnimeId(id)))throw Error('INVALID');const items=[];let partial=false;
 for(const id of unique){try{items.push(await getAnimeDetail(id,{resource}));}catch{partial=true;}}return {items,partial};
}
