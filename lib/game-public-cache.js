import {createClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
import {resourceMetrics} from './resource-metrics.js';

let client;
function database(){
 if(client)return client;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return null;
 return client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(4000)})}});
}
export function createGameCacheStorage({getDatabase=database,clock=Date.now,cleanupMs=3600000}={}){
 let cleanupAfter=0;
 return {
  async read(key){const db=getDatabase();if(!db)return null;resourceMetrics.record('Supabase:catalog-read','requests');const {data,error}=await db.from('void_game_catalog_cache').select('value,expires_at,updated_at').eq('cache_key',key).maybeSingle();if(error)throw error;return data;},
  async write(key,value,ttl){const db=getDatabase();if(!db)return;resourceMetrics.record('Supabase:catalog-write','requests');const {error}=await db.from('void_game_catalog_cache').upsert({cache_key:key,value,expires_at:new Date(clock()+ttl).toISOString(),updated_at:new Date(clock()).toISOString()});if(error)throw error;
   if(clock()>=cleanupAfter){cleanupAfter=clock()+cleanupMs;resourceMetrics.record('Supabase:catalog-cleanup','requests');await db.from('void_game_catalog_cache').delete().lt('updated_at',new Date(clock()-30*86400000).toISOString());}
  },
 };
}
const storage=createGameCacheStorage();
export function createPublicGameCache({read=storage.read,write=storage.write,clock=Date.now,limit=500,metrics=resourceMetrics}={}){
 const memory=new Map(),pending=new Map();
 return async function cached(key,load,{ttl=86400000,stale=30*86400000,persist=true}={}){
  key=createHash('sha256').update('igdb-v1:'+key).digest('hex');
  const local=memory.get(key);if(local?.expires>clock()){metrics.record('IGDB:public-cache','hits');return local.value;}
  if(pending.has(key)){metrics.record('IGDB:public-cache','deduplicated');return pending.get(key);}
  const task=(async()=>{
   let old=local;
   try{if(!old&&persist){const row=await read(key);if(row)old={value:row.value,expires:Date.parse(row.expires_at),updated:Date.parse(row.updated_at)};}}catch{/* Database failure must not block the provider. */}
   if(old?.expires>clock()){if(memory.size>=limit)memory.delete(memory.keys().next().value);memory.set(key,old);metrics.record('IGDB:public-cache','hits');return old.value;}
   metrics.record('IGDB:public-cache','misses');
   try{
    const value=await load();
    if(memory.size>=limit)memory.delete(memory.keys().next().value);
    memory.set(key,{value,expires:clock()+ttl,updated:clock()});
    try{if(persist)await write(key,value,ttl);}catch{/* Only public catalogue metadata is cached. */}
    return value;
   }catch(error){
    if(old&&clock()-old.updated<stale){memory.set(key,{...old,expires:clock()+300000});return old.value;}
    throw error;
   }
  })().finally(()=>pending.delete(key));
  pending.set(key,task);return task;
 };
}
export const publicGameCache=createPublicGameCache();
