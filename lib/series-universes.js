import {seriesUniverses,seriesUniverseBySlug} from '../config/series-universes.js';
import {seriesResource} from './series-catalog.js';
import {normalizeSeries,seriesAllowed} from './series-model.js';
import {releaseOrder} from './franchises.js';

async function mapLimit(items,load,concurrency=3){
  const results=new Array(items.length);let next=0;
  await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{for(;;){const index=next++;if(index>=items.length)return;results[index]=await load(items[index]);}}));
  return results;
}
const titleKey=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function matchesSeriesIdentity(raw,[id,title]){
  return raw?.id===id&&titleKey(raw.original_name||raw.name)===titleKey(title);
}
export async function getSeriesUniverse(slug,{fetcher}={}){
  const config=seriesUniverseBySlug(slug);if(!config)throw Error('NOT_FOUND');
  let partial=false;
  const loaded=await mapLimit(config.entries,async entry=>{
    try{
      const raw=await seriesResource(`tv/${entry[0]}`,{append_to_response:'keywords'},fetcher);
      if(!matchesSeriesIdentity(raw,entry)||!seriesAllowed(raw)){partial=true;return null;}
      return normalizeSeries(raw);
    }catch{partial=true;return null;}
  });
  const movies=loaded.filter(Boolean).sort(releaseOrder);
  if(!movies.length)throw Error('SOURCE');
  return {slug:config.slug,nome:config.nome,cor:config.cor,descricao:config.descricao,note:config.note||null,ordem_cronologica:config.chronology||[],movies,total:movies.length,backdrop:movies.find(row=>row.backdrop)?.backdrop||null,partial};
}
export async function getSeriesUniverseIndex(options={}){
  return mapLimit(seriesUniverses,async config=>{
    try{
      const data=await getSeriesUniverse(config.slug,options);
      const {movies,ordem_cronologica,...row}=data;
      return {...row,movieIds:movies.map(item=>item.id),previews:movies.filter(item=>item.poster).slice(0,4).map(({id,titulo,poster})=>({id,titulo,poster:poster.replace('/w342/','/w185/')}))};
    }catch{return {slug:config.slug,nome:config.nome,cor:config.cor,error:true};}
  },1);
}
