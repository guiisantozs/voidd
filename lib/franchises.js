import { fetchJson } from './api.js';
import { normalizeMovie } from './movie-catalog.js';
import { franchises, franchiseBySlug } from '../franchises.config.js';
export const FRANCHISE_TTL=86400000;
const cache=new Map(),pending=new Map(),sourceCache=new Map(),sourcePending=new Map();
export function clearFranchiseCache(){cache.clear();pending.clear();sourceCache.clear();sourcePending.clear();}
async function tmdb(path,params={},now=Date.now()){
  const key=process.env.TMDB_API_KEY;if(!key||key==='cole_sua_chave_aqui')throw Error('CONFIG');
  const url=new URL(`https://api.themoviedb.org/3/${path}`);
  Object.entries({language:'pt-BR',...params}).forEach(([k,v])=>url.searchParams.set(k,String(v)));
  const id=url.toString(),saved=sourceCache.get(id);
  if(saved&&saved.expires>now)return saved.data;if(sourcePending.has(id))return sourcePending.get(id);
  url.searchParams.set('api_key',key);
  const task=fetchJson(url).then(data=>{if(sourceCache.size>=500)sourceCache.delete(sourceCache.keys().next().value);sourceCache.set(id,{data,expires:now+FRANCHISE_TTL});return data;}).finally(()=>sourcePending.delete(id));
  sourcePending.set(id,task);return task;
}
async function mapLimit(items,fn){const results=new Array(items.length);let next=0;await Promise.all(Array.from({length:Math.min(3,items.length)},async()=>{for(;;){const i=next++;if(i>=items.length)return;results[i]=await fn(items[i]);}}));return results;}
async function discover(params,now){
  const first=await tmdb('discover/movie',{include_adult:false,sort_by:'primary_release_date.asc',...params},now);
  if(!Array.isArray(first.results)||!Number.isFinite(first.total_pages)||first.total_pages>50)throw Error('SOURCE');
  const rest=await mapLimit(Array.from({length:Math.max(0,first.total_pages-1)},(_,i)=>i+2),page=>tmdb('discover/movie',{include_adult:false,sort_by:'primary_release_date.asc',...params,page},now));
  return [first,...rest].flatMap(page=>page.results);
}
export function releaseOrder(a,b){return (a.estreia||'9999-99-99').localeCompare(b.estreia||'9999-99-99')||Number(a.id)-Number(b.id);}
export function mergeFranchiseMovies(config,groups){
  const exclude=new Set(config.excluir||[]),include=new Set(config.incluir||[]);
  const result=new Map();
  for(const item of groups.flat()){
    if(!item?.id||item.adult||exclude.has(item.id))continue;
    const genreIds=item.genre_ids||item.genres?.map(g=>g.id)||[];
    if(!include.has(item.id)&&genreIds.some(id=>config.excluir_generos?.includes(id)))continue;
    if(!result.has(item.id))result.set(item.id,normalizeMovie({...item,genre_ids:genreIds}));
  }
  return [...result.values()].sort(releaseOrder);
}
export async function getFranchise(slug,now=Date.now()){
  const config=franchiseBySlug(slug);if(!config)throw Error('NOT_FOUND');
  if(!process.env.TMDB_API_KEY||process.env.TMDB_API_KEY==='cole_sua_chave_aqui')throw Error('CONFIG');
  const saved=cache.get(slug);if(saved&&saved.expires>now)return saved.data;if(pending.has(slug))return pending.get(slug);
  const task=(async()=>{
    const sources=config.fontes,groups=[];let partial=false;
    const tasks=(sources.colecoes||[]).map(id=>async()=>{const data=await tmdb(`collection/${id}`,{},now);if(!Array.isArray(data.parts))throw Error('SOURCE');return data.parts;});
    if(sources.keywords?.length)tasks.push(()=>discover({with_keywords:sources.keywords.join('|')},now));
    if(sources.empresas?.length)tasks.push(()=>discover({with_companies:sources.empresas.join('|')},now));
    if(sources.animacao_empresas?.length)tasks.push(()=>discover({with_companies:sources.animacao_empresas.join('|'),with_genres:16,'with_runtime.gte':60},now));
    const resolved=await mapLimit(tasks,async load=>{try{return await load();}catch{partial=true;return null;}});
    groups.push(...resolved.filter(Boolean));
    const present=new Set(groups.flat().map(movie=>movie.id));
    const missing=[...new Set([...(sources.filmes||[]),...(config.incluir||[])])].filter(id=>!present.has(id));
    groups.push((await mapLimit(missing,async id=>{try{return await tmdb(`movie/${id}`,{},now);}catch{partial=true;return null;}})).filter(Boolean));
    if(!groups.flat().length&&partial)throw Error('SOURCE');
    const movies=mergeFranchiseMovies(config,groups);
    const backdrop=movies.find(movie=>movie.backdrop)?.backdrop||null;
    const data={slug:config.slug,nome:config.nome,cor:config.cor,descricao:config.descricao,ordem_cronologica:config.ordem_cronologica||[],movies,backdrop,total:movies.length,partial};
    cache.set(slug,{data,expires:now+(partial?60000:FRANCHISE_TTL)});return data;
  })().finally(()=>pending.delete(slug));pending.set(slug,task);return task;
}
export async function getFranchiseIndex(now=Date.now()){
  return mapLimit(franchises,async config=>{try{const data=await getFranchise(config.slug,now);const{movies,ordem_cronologica,...card}=data;return {...card,backdrop:card.backdrop?.replace('/w1280/','/w780/')||null,movieIds:movies.map(m=>m.id),previews:movies.filter(movie=>movie.poster).slice(0,4).map(({id,titulo,poster})=>({id,titulo,poster:poster.replace('/w342/','/w185/')}))};}catch{return {slug:config.slug,nome:config.nome,cor:config.cor,error:true};}});
}
export async function movieUniverses(id){
  const index=await getFranchiseIndex();
  const matches=index.filter(row=>!row.error&&row.movieIds.includes(id));
  const universes=await Promise.all(matches.map(async row=>{
    const data=await getFranchise(row.slug);const at=data.movies.findIndex(movie=>movie.id===id);
    return {slug:row.slug,nome:row.nome,cor:row.cor,movies:data.movies.slice(Math.max(0,at-1),at+2).filter(movie=>movie.id!==id)};
  }));
  return {universes,partial:index.some(row=>row.error||row.partial)};
}
