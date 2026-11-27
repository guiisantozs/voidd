import {useEffect,useState} from 'react';

// Catalogue responses only. Social data is deliberately kept out of this cache.
const cache=new Map();
const SESSION_CACHE_LIMIT=150;
export const OVERVIEW_PARTS=['facts','screenshots','trailer','stores','series','editions','studio','similar'];
export const HERO_MEDIA_PARTS=['screenshots','trailer','stores'];
export const OVERVIEW_CONTENT_PARTS=OVERVIEW_PARTS.filter(part=>!HERO_MEDIA_PARTS.includes(part));
export function gameOverviewResource(id,part,{force=false}={}){
  const key=id+':'+part;
  if(force)cache.delete(key);
  if(cache.has(key))return cache.get(key);
  const url=part==='similar'?`/api/game-similar?id=${encodeURIComponent(id)}`:`/api/game-overview?id=${encodeURIComponent(id)}&part=${part}`;
  const promise=fetch(url).then(async response=>{if(!response.ok)throw Error('OVERVIEW');const value=await response.json();if(value.partial)cache.delete(key);return part==='similar'?value:value.data;}).catch(error=>{cache.delete(key);throw error;});
  if(cache.size>=SESSION_CACHE_LIMIT)cache.delete(cache.keys().next().value);cache.set(key,promise);return promise;
}
export function useGameOverviewData(item,{parts=OVERVIEW_PARTS}={}){
  const seed={facts:item.overviewFacts,screenshots:item.screenshots,trailer:item.trailer,stores:item.stores};
  const [state,setState]=useState(()=>Object.fromEntries(parts.map(key=>[key,seed[key]!==undefined?{data:seed[key]}:{loading:true}])));
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let active=true;
    Promise.allSettled(parts.map(async part=>{
      if(!attempt&&seed[part]!==undefined)return;
      setState(old=>({...old,[part]:{loading:true}}));
      try{const data=await gameOverviewResource(item.id,part,{force:attempt>0});if(active)setState(old=>({...old,[part]:{data} }));}
      catch{if(active)setState(old=>({...old,[part]:{error:true}}));}
    }));
    return()=>{active=false;};
  },[item.id,attempt,parts.join(',')]);
  return {state,retry:()=>setAttempt(value=>value+1)};
}
