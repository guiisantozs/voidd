import {animeResource,animeAllowed,normalizeAnime} from './anime-catalog.js';
import {animeId,decodeAnimeId} from './anime-provider.js';
import {animeCache,ANIME_TTL} from './anime-cache.js';
import {animeFranchise} from './anime-franchise.js';
import {reserveGlobalBudget} from './global-provider-budget.js';
const safeCard=item=>item?.categoria==='animes'&&item.poster&&!item.adult&&!item.isAdult&&!item.genreIds?.some(id=>[12,49].includes(id));
export function animeSimilarity(a,b){return (a.genreIds||[]).filter(id=>b.genreIds?.includes(id)).length*3+(a.themes||[]).filter(t=>b.themes?.includes(t)).length*2+(b.nota||0)/5;}
export async function animeRecommendationMetadata(rows,{cache=animeCache,fetcher=(...args)=>fetch(...args)}={}){
 const ids=[...new Set(rows.map(row=>decodeAnimeId(row.id)).filter(Boolean))].sort((a,b)=>a-b).slice(0,18);if(!ids.length)return [];
 const data=await cache.get('recommendation-metadata:v1:'+ids.join(','),async()=>{
  await reserveGlobalBudget('anilist');
  const response=await fetcher('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'query($ids:[Int]){Page(perPage:18){media(type:ANIME,idMal_in:$ids){idMal isAdult format genres startDate{year month day} title{english romaji} coverImage{extraLarge}}}}',variables:{ids}}),signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error('METADATA_UNAVAILABLE');const d=await response.json();if(d.errors||!Array.isArray(d.data?.Page?.media))throw Error('METADATA_UNAVAILABLE');return d.data.Page.media;
 },{ttl:ANIME_TTL.static});
 const counts=new Map();for(const row of data)counts.set(row.idMal,(counts.get(row.idMal)||0)+1);
 const verified=data.filter(row=>counts.get(row.idMal)===1&&row.isAdult===false&&!(row.genres||[]).some(g=>['Hentai','Ecchi'].includes(g))),byId=new Map(verified.map(row=>[animeId(row.idMal),row]));
 return rows.flatMap(row=>{const match=byId.get(row.id);return match?[{...row,adult:false,adultVerified:true,poster:match.coverImage?.extraLarge||row.poster,displayTitle:match.title?.english||row.titulo,ano:String(match.startDate?.year||row.ano||'')}]:[];});
}
export function createAnimeSimilar({cache=animeCache,franchise=animeFranchise,resource=animeResource,metadata=rows=>animeRecommendationMetadata(rows,{cache})}={}){return async id=>cache.get('similar:v1:'+id,async()=>{
 const local=await cache.catalog(),current=await cache.peek('detail:v1:'+id,{fresh:true})||local.find(row=>row.id===Number(id))||{},graph=await franchise(id).catch(()=>({seasons:[],specials:[]})),excluded=new Set([Number(id),...graph.seasons.map(row=>row.id)]),localById=new Map(local.map(row=>[row.id,row]));
 let recommendations=[],failed=false;
 try{const {data}=await resource(`anime/${decodeAnimeId(id)}/recommendations`,{},ANIME_TTL.recommendations);const rows=(Array.isArray(data)?data:[]).map(row=>row.entry).filter(row=>row&&animeAllowed(row)).map(normalizeAnime).filter(row=>!excluded.has(row.id));
  const missing=rows.filter(row=>!localById.has(row.id)).slice(0,18);let checked=[];try{checked=await metadata(missing);}catch{/* Unverified adult classification is never assumed safe. */}
  const byId=new Map(checked.map(row=>[row.id,row]));recommendations=rows.map(row=>localById.get(row.id)||byId.get(row.id)).filter(Boolean);
 }catch{failed=true;}
 const fallback=local.filter(row=>animeSimilarity(current,row)>1).sort((a,b)=>animeSimilarity(current,b)-animeSimilarity(current,a));
 const movies=[],seen=new Set(excluded);for(const row of [...graph.specials,...recommendations,...fallback])if(safeCard(row)&&!seen.has(row.id)){seen.add(row.id);movies.push(row);if(movies.length===18)break;}
 return {movies,page:1,totalPages:1,partial:failed&&!movies.length,retryable:failed&&!movies.length};
 },{ttl:ANIME_TTL.recommendations});}
export const animeSimilar=createAnimeSimilar();
