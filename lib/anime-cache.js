import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {waitUntil} from '@vercel/functions';
const DAY=86400000;
export const ANIME_TTL={static:30*DAY,airing:12*3600000,finished:60*DAY,recommendations:30*DAY};
let db;
function database(){if(db)return db;const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)return null;return db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(4000)})}});}
export const animeStorage={
 async read(key){const c=database();if(!c)return null;const {data,error}=await c.from('void_anime_cache').select('payload,fetched_at,expires_at').eq('cache_key',key).maybeSingle();if(error)throw error;return data?.payload==null?null:data;},
 async claim(key,token){const c=database();if(!c)return true;const {data,error}=await c.rpc('void_anime_cache_claim',{p_key:key,p_token:token});if(error)throw error;return data;},
 async write(key,payload,ttl,token){const c=database();if(!c)return;const now=Date.now();const {error}=await c.from('void_anime_cache').update({payload,fetched_at:new Date(now).toISOString(),ttl_seconds:Math.ceil(ttl/1000),expires_at:new Date(now+ttl).toISOString(),refresh_until:null,refresh_token:null}).eq('cache_key',key).eq('refresh_token',token);if(error)throw error;},
 async release(key,token){const c=database();if(c)await c.from('void_anime_cache').update({refresh_until:null,refresh_token:null}).eq('cache_key',key).eq('refresh_token',token);},
 async catalog(){const c=database();if(!c)return [];const {data,error}=await c.from('void_anime_cache').select('payload').like('cache_key','detail:v1:%').not('payload','is',null).order('fetched_at',{ascending:false}).limit(240);if(error)throw error;return (data||[]).map(row=>row.payload);},
 async slot(block=0){const c=database();if(!c)return 0;const {data,error}=await c.rpc('void_anime_api_slot',{p_block_seconds:block});if(error)throw error;return data;}
};
export function createAnimeCache({store=animeStorage,clock=Date.now,background=task=>waitUntil(task),sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const memory=new Map(),pending=new Map(),reading=new Map(),retry=new Map(),loading=new AsyncLocalStorage();
 const remember=(key,row)=>{if(memory.size>=600)memory.delete(memory.keys().next().value);memory.set(key,row);};
 async function peek(key){if(memory.has(key))return memory.get(key);if(reading.has(key))return reading.get(key);const task=Promise.resolve().then(()=>store.read(key)).catch(()=>null).then(row=>{if(row)remember(key,row);return row;}).finally(()=>reading.delete(key));reading.set(key,task);return task;}
 function refresh(key,load,ttl,old){
  if(pending.has(key))return pending.get(key);
  const task=(async()=>{const token=randomUUID();let claimed=false;
   try{claimed=await store.claim(key,token);}catch{/* Database outage: retain in-process deduplication. */claimed=true;}
   try{
    if(!claimed){
     // A sibling instance may be rebuilding this resource. An expired row is
     // never a completed refresh for a dependent cache entry.
     const deadline=clock()+40000;let waited=0,delay=1000;
     while(waited<40000&&clock()<deadline){const pause=Math.min(delay,40000-waited);await sleep(pause);waited+=pause;delay=Math.min(delay*2,4000);const hit=await store.read(key);if(hit&&Date.parse(hit.expires_at)>clock()){remember(key,hit);retry.delete(key);return hit.payload;}}
     throw Error('CACHE_REFRESH_PENDING');
    }
    const parent=loading.getStore(),scope={degraded:false};
    const payload=await loading.run(scope,load),lifetime=typeof ttl==='function'?ttl(payload):ttl,degraded=scope.degraded||payload?.partial||payload?.stale,effectiveTtl=degraded?Math.min(lifetime,300000):lifetime,row={payload,fetched_at:new Date(clock()).toISOString(),expires_at:new Date(clock()+effectiveTtl).toISOString()};
    if(degraded&&parent)parent.degraded=true;
    remember(key,row);retry.delete(key);try{await store.write(key,payload,effectiveTtl,token);}catch{/* A public cache write must not hide valid catalogue data. */}return payload;
   }catch(error){retry.set(key,clock()+60000);throw error;}
   finally{if(claimed)await store.release(key,token).catch(()=>{});}
  })().finally(()=>pending.delete(key));pending.set(key,task);return task;
 }
 return {peek:async(key,{fresh=false}={})=>{const row=await peek(key);return row&&(!fresh||Date.parse(row.expires_at)>clock())?structuredClone(row.payload):null;},async get(key,load,{ttl=ANIME_TTL.static}={}){
  const old=await peek(key),scope=loading.getStore();if(old&&Date.parse(old.expires_at)>clock()){if(scope&&(old.payload?.stale||old.payload?.partial))scope.degraded=true;return structuredClone(old.payload);}
  if(old){
   // Only the outer response uses stale-while-revalidate. A rebuilding detail,
   // franchise or episode page must await its own expired source first.
   if(scope){if(retry.get(key)>clock())throw Error('CACHE_REFRESH_BACKOFF');return structuredClone(await refresh(key,load,ttl,old));}
   if(!(retry.get(key)>clock())){const task=refresh(key,load,ttl,old).catch(()=>{});background(task);}return structuredClone(old.payload);
  }
  return structuredClone(await refresh(key,load,ttl,null));
 },async catalog(){let rows=[];try{rows=await store.catalog();}catch{}return [...new Map([...rows,...[...memory].filter(([key])=>key.startsWith('detail:v1:')).map(([,row])=>row.payload)].filter(Boolean).map(item=>[item.id,item])).values()];}};
}
export const animeCache=createAnimeCache();
export async function reserveAnimeApiSlot(){for(let attempt=0;attempt<8;attempt++){let wait;try{wait=await animeStorage.slot();}catch{return;}if(!wait)return;if(wait>10000)throw Object.assign(Error('JIKAN_RATE_LIMIT'),{status:429,retryAfter:Math.ceil(wait/1000)});await new Promise(r=>setTimeout(r,wait));}throw Object.assign(Error('JIKAN_RATE_LIMIT'),{status:429,retryAfter:2});}
