import {resourceMetrics} from './resource-metrics.js';
import {SEARCH_CACHE_MS,SELECTION_CACHE_MS,normalizeSearchTerm} from './catalog-cache-policy.js';
export {SEARCH_DELAY_MS,shortSearch} from './catalog-cache-policy.js';

export const PUBLIC_CATALOG_STORAGE='void:public-catalog:v1';

function route(path){
  if(/^\/api\/animes\/(?:search|metadata|credits|editorial|weekly|new-episodes|hero|trending|new-seasons|upcoming|acclaimed|essentials|recommended|drama|comedy|action|scifi|fantasy|romance|horror|sports)$/.test(path))return path;
  if(/^\/api\/(?:movie-search|jogos|series|series-detail|anime|anime-detail|profile-media-search|profile-banner|gamer-profile-media)$/.test(path))return path;
  if(/^\/api\/filmes\/[a-z-]+$/.test(path))return path;
  if(/^\/api\/series\/(?:search|metadata|editorial|weekly|new-episodes|hero|trending|new-seasons|acclaimed|essentials|drama|comedy|action|scifi|crime|horror|thriller|romance|documentary|family|politics)$/.test(path))return path;
  throw Error('PUBLIC_CATALOG_ROUTE_REQUIRED');
}

// Explicitly public GET catalogue only. Authenticated/social endpoints cannot
// enter this cache. Each subscriber owns its cancellation, not the shared fetch.
export function createPublicCatalogClient({fetcher=(...args)=>fetch(...args),clock=Date.now,metrics=resourceMetrics,limit=100,maxBytes=2*1024*1024,storage=()=>typeof window==='undefined'?null:window.sessionStorage}={}){
  const cache=new Map(),pending=new Map();let bytes=0,hydrated=false;
  const ttl=label=>/search|jogos|profile-media/.test(label)?SEARCH_CACHE_MS:SELECTION_CACHE_MS;
  function remove(key){const row=cache.get(key);if(row){bytes-=row.bytes;cache.delete(key);}}
  function hydrate(){
    if(hydrated)return;hydrated=true;
    try{
      const text=storage()?.getItem(PUBLIC_CATALOG_STORAGE);if(!text||text.length*2>maxBytes)return;
      const snapshot=JSON.parse(text);if(snapshot.version!==1||!Array.isArray(snapshot.rows)||snapshot.rows.length>limit)return;
      for(const [key,row] of snapshot.rows){
        if(!row||!row.data||typeof row.data!=='object'||!Number.isFinite(row.expires))continue;
        const url=new URL(key,'https://void.local');if(!key.startsWith('/api/')||url.origin!=='https://void.local'||url.hash)continue;
        const label=route(url.pathname),size=JSON.stringify(row.data).length*2;
        // Discard only obsolete anime editorial artwork, including trailer
        // thumbnails retained by a previous session. Other caches stay valid.
        if(/^\/api\/(?:anime|animes\/(?:editorial|hero|weekly|trending))$/.test(url.pathname)&&row.data.discoveryVersion!==2)continue;
        if(url.pathname==='/api/animes/editorial'&&row.data.artworkVersion!==6)continue;
        if(!Number.isFinite(row.savedAt)||row.savedAt>clock()||row.expires<=clock()||row.expires>row.savedAt+ttl(label)||row.data?.partial||size+bytes>maxBytes)continue;
        remove(key);cache.set(key,{...row,bytes:size});bytes+=size;
      }
    }catch{/* Corrupt, blocked or full browser storage must not block catalogue. */}
  }
  function persist(){
    try{
      const rows=[...cache].filter(([,row])=>row.expires>clock()).map(([key,{data,expires,savedAt}])=>[key,{data,expires,savedAt}]);
      let text=JSON.stringify({version:1,rows});
      while(text.length*2>maxBytes&&rows.length){rows.shift();text=JSON.stringify({version:1,rows});}
      storage()?.setItem(PUBLIC_CATALOG_STORAGE,text);
    }catch{/* Memory cache still works when sessionStorage is unavailable. */}
  }
  function request(path,{signal}={}){
    if(signal?.aborted)return Promise.reject(new DOMException('Aborted','AbortError'));
    const url=new URL(path,'https://void.local');
    if(url.origin!=='https://void.local'||!path.startsWith('/api/')||url.hash)throw Error('PUBLIC_CATALOG_ROUTE_REQUIRED');
    const label=route(url.pathname);
    if(['/api/movie-search','/api/series/search','/api/animes/search'].includes(url.pathname)){
      for(const [name,value] of Object.entries({q:'',genre:'all',year:'',cursor:'1:0'}))if(!url.searchParams.has(name))url.searchParams.set(name,value);
    }
    if(url.pathname==='/api/profile-media-search'&&!url.searchParams.has('page'))url.searchParams.set('page','1');
    if(url.searchParams.has('q'))url.searchParams.set('q',normalizeSearchTerm(url.searchParams.get('q')));
    url.searchParams.sort();const fetchPath=url.pathname+url.search;
    if(url.searchParams.has('q'))url.searchParams.set('q',url.searchParams.get('q').toLocaleLowerCase('pt-BR'));
    const key=url.pathname+url.search;hydrate();
    const saved=cache.get(key);
    if(saved?.expires>clock()){metrics.record(label,'hits');return Promise.resolve(structuredClone(saved.data));}
    remove(key);
    let entry=pending.get(key);
    if(entry)metrics.record(label,'deduplicated');
    else{
      metrics.record(label,'misses');
      const controller=new AbortController();entry={controller,users:0};
      const started=clock();
      entry.promise=Promise.resolve().then(async()=>{
        try{
          const response=await fetcher(fetchPath,{signal:controller.signal,credentials:'omit'});
          const data=await response.json();
          if(!response.ok){if(response.status===429)metrics.record(label,'limited');throw Object.assign(Error(data.erro||'Catálogo indisponível.'),{code:data.code,status:response.status});}
          if(!controller.signal.aborted&&!data.partial&&!/private|no-store/i.test(response.headers?.get('Cache-Control')||'')){
            const size=JSON.stringify(data).length*2;
            if(size<=maxBytes){
              while(cache.size>=limit||bytes+size>maxBytes)remove(cache.keys().next().value);
              cache.set(key,{data,bytes:size,savedAt:clock(),expires:clock()+ttl(label)});bytes+=size;persist();
            }
          }
          return data;
        }catch(error){if(error.name!=='AbortError')metrics.record(label,'errors');throw error;}
        finally{metrics.record(label,'requests',clock()-started);if(pending.get(key)===entry)pending.delete(key);}
      });
      pending.set(key,entry);
    }
    entry.users++;
    return new Promise((resolve,reject)=>{
      let done=false;
      const finish=(callback,value)=>{if(done)return;done=true;signal?.removeEventListener('abort',abort);entry.users--;callback(value);};
      const abort=()=>{
        finish(reject,new DOMException('Aborted','AbortError'));
        // Allow a remount in the same turn to reuse the in-flight request.
        queueMicrotask(()=>{if(!entry.users&&pending.get(key)===entry){pending.delete(key);entry.controller.abort();}});
      };
      signal?.addEventListener('abort',abort,{once:true});
      entry.promise.then(data=>finish(resolve,structuredClone(data)),error=>finish(reject,error));
    });
  }
  return {request,clear(){cache.clear();bytes=0;hydrated=true;try{storage()?.removeItem(PUBLIC_CATALOG_STORAGE);}catch{}},snapshot:()=>metrics.snapshot()};
}
export const publicCatalog=createPublicCatalogClient();
if(typeof window!=='undefined'&&process.env.NODE_ENV==='development')window.voidResourceMetrics=()=>resourceMetrics.snapshot();
