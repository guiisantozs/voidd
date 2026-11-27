import {animeId,decodeAnimeId} from './anime-provider.js';
import {reserveGlobalBudget} from './global-provider-budget.js';
import {createProviderGuard,retryAfterSeconds} from './provider-guard.js';
import {resourceMetrics} from './resource-metrics.js';

const QUERY='query Artwork($ids:[Int]) { Page(page:1,perPage:50) { pageInfo { hasNextPage } media(type:ANIME,idMal_in:$ids) { id idMal isAdult coverImage { extraLarge large } bannerImage relations { edges { relationType node { idMal type isAdult format title { romaji english native } startDate { year } } } } } } }';
const image=value=>{try{const url=new URL(value);return url.protocol==='https:'&&(url.hostname==='anilist.co'||url.hostname.endsWith('.anilist.co'))?url.href:null;}catch{return null;}};
export function createAniListArtwork({fetcher=(...args)=>fetch(...args),clock=()=>Date.now()}={}){
 const cache=new Map(),pending=new Map(),guard=createProviderGuard({concurrency:2,minuteBudget:30,clock});let blockedUntil=0;
 async function batch(ids){
  if(clock()<blockedUntil)throw Error('ARTWORK_UNAVAILABLE');
  const start=clock();
  try{
   const response=await guard.run(ids.join(','),async()=>{await reserveGlobalBudget('anilist');return fetcher('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({query:QUERY,variables:{ids}}),signal:AbortSignal.timeout(8000)});});
   if(!response.ok){if(response.status===429)blockedUntil=clock()+retryAfterSeconds(response.headers?.get('Retry-After'))*1000;throw Error('ARTWORK_UNAVAILABLE');}
   const data=await response.json();if(data.errors?.length||!Array.isArray(data.data?.Page?.media)||data.data.Page.pageInfo?.hasNextPage)throw Error('ARTWORK_SOURCE');
   const rows=data.data.Page.media,counts=new Map();for(const row of rows)counts.set(row.idMal,(counts.get(row.idMal)||0)+1);
   for(const id of ids){
    const row=counts.get(id)===1?rows.find(row=>row.idMal===id&&row.isAdult===false):null;
    const poster=image(row?.coverImage?.extraLarge)||image(row?.coverImage?.large),backdrop=image(row?.bannerImage);
    // The detail route has no discovery signals. Carry explicit prequels in
    // this same batched query so a MAL sequel can resolve its TMDB series.
    const franchiseReferences=(row?.relations?.edges||[]).filter(edge=>edge.relationType==='PREQUEL'&&edge.node?.type==='ANIME'&&edge.node.isAdult===false&&edge.node.format==='TV'&&animeId(edge.node.idMal)&&edge.node.startDate?.year&&edge.node.title?.romaji).slice(0,8).map(({node})=>({id:animeId(node.idMal),titulo:node.title.romaji,englishTitle:node.title.english||'',originalTitle:node.title.native||'',ano:String(node.startDate.year),format:'TV'}));
    const art=poster||backdrop||franchiseReferences.length?{...(poster?{poster,posterPath:null}:{}),...(backdrop?{backdrop,backdropPath:null}:{}),...(franchiseReferences.length?{franchiseReferences}:{}),artworkProvider:'anilist',artworkAniListId:row.id}:null;
    if(cache.size>=800)cache.delete(cache.keys().next().value);cache.set(id,{art,until:clock()+(art?86400000:3600000)});
   }
  }catch(error){blockedUntil=Math.max(blockedUntil,clock()+60000);resourceMetrics.record('anilist:artwork','errors');throw error;}
  finally{resourceMetrics.record('anilist:artwork','requests',clock()-start);}
 }
 return {async items(items){
  const ids=[...new Set(items.map(item=>decodeAnimeId(item.id)).filter(Boolean))].sort((a,b)=>a-b),missing=ids.filter(id=>!(cache.get(id)?.until>clock())&&!pending.has(id));
  for(let offset=0;offset<missing.length;offset+=25){const group=missing.slice(offset,offset+25),task=batch(group).finally(()=>{for(const id of group)pending.delete(id);});for(const id of group)pending.set(id,task);}
  await Promise.allSettled([...new Set(ids.map(id=>pending.get(id)).filter(Boolean))]);
  return items.map(item=>{const entry=cache.get(decodeAnimeId(item.id));if(!(entry?.until>clock()&&entry.art))return item;const merged={...item,backdropFallback:item.backdrop,posterFallback:item.posterFallback||item.poster,...entry.art};if(item.franchiseReferences?.length)merged.franchiseReferences=[...new Map([...item.franchiseReferences,...entry.art.franchiseReferences||[]].map(ref=>[ref.id,ref])).values()];return merged;});
 }};
}
export const aniListArtwork=createAniListArtwork();
