import {createProviderGuard,retryAfterSeconds} from './provider-guard.js';
import {resourceMetrics} from './resource-metrics.js';
import {bestAnimeImage} from './anime-artwork-policy.js';
import {reserveGlobalBudget} from './global-provider-budget.js';

const fullImage=value=>{try{const url=new URL(value);if(url.hostname!=='assets.fanart.tv'||!url.pathname.startsWith('/fanart/')||!['https:','http:'].includes(url.protocol))return null;url.protocol='https:';return url.href;}catch{return null;}};
export function selectFanartArtwork(data){
 const rows=key=>(data[key]||[]).flatMap(row=>{const url=fullImage(row.url);return url?[{...row,url,width:Number(row.width),height:Number(row.height),iso_639_1:row.lang==='00'?null:row.lang,vote_count:Number(row.likes)||0,vote_average:Math.min(10,Number(row.likes)||0)}]:[];});
 const poster=bestAnimeImage([...rows('movieposter'),...rows('tvposter')],'poster'),backdrop=bestAnimeImage([...rows('movie4kbackground'),...rows('show4kbackground'),...rows('moviebackground'),...rows('showbackground')],'backdrop');
 return {...(poster?{poster:poster.url,posterPath:null,posterProvider:'fanart'}:{}),...(backdrop?{backdrop:backdrop.url,backdropPath:null,backdropWidth:backdrop.width,backdropHeight:backdrop.height,backdropProvider:'fanart'}:{})};
}
export function createFanartArtwork({key=()=>process.env.FANART_API_KEY,fetcher=(...args)=>fetch(...args),clock=()=>Date.now()}={}){
 const cache=new Map(),pending=new Map(),guard=createProviderGuard({concurrency:2,minuteBudget:20,clock});let blockedUntil=0;
 return {enabled:()=>!!key(),async get({type,tmdbId,tvdbId}){
  const id=Number(type==='movie'?tmdbId:tvdbId),kind=type==='movie'?'movies':'tv';if(!key()||!Number.isSafeInteger(id)||id<=0)return {};
  const identity=`${kind}:${id}`,hit=cache.get(identity);if(hit?.until>clock())return structuredClone(hit.data);if(clock()<blockedUntil)return {};
  if(pending.has(identity))return pending.get(identity).then(structuredClone);
  const task=guard.run(identity,async()=>{
   const started=clock();try{
    // Server-only key. Never log this URL or return upstream error bodies.
    const url=new URL(`https://webservice.fanart.tv/v3.2/${kind}/${id}`);url.searchParams.set('api_key',key());
    await reserveGlobalBudget('fanart');
    const response=await fetcher(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000)});
    if(response.status===429){blockedUntil=clock()+retryAfterSeconds(response.headers?.get('Retry-After'))*1000;return {};}
    if(!response.ok&&response.status!==404)throw Error('FANART_UNAVAILABLE');
    const raw=response.status===404?null:await response.json();
    if(raw&&Number(type==='movie'?raw.tmdb_id:raw.thetvdb_id)!==id)throw Error('FANART_IDENTITY');
    const data=raw?selectFanartArtwork(raw):{};if(cache.size>=400)cache.delete(cache.keys().next().value);cache.set(identity,{data,until:clock()+(Object.keys(data).length?86400000:3600000)});return data;
   }catch{blockedUntil=clock()+60000;resourceMetrics.record('fanart:artwork','errors');return {};}
   finally{resourceMetrics.record('fanart:artwork','requests',clock()-started);}
  }).catch(()=>({})).finally(()=>pending.delete(identity));pending.set(identity,task);return task.then(structuredClone);
 }};
}
export const fanartArtwork=createFanartArtwork();
