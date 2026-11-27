import { fetchJson } from './api.js';
import { normalizeMovie } from './movie-catalog.js';
import {loadRelatedMovies,clearSimilarityCache} from './movie-similarity.js';

const cache = new Map();
const pending = new Map();
export const DETAIL_TTL = 3600000;
export function clearDetailCache() { cache.clear(); pending.clear();clearSimilarityCache(); }
async function request(path, params = {}) {
  const key = process.env.TMDB_API_KEY;
  if (!key || key === 'cole_sua_chave_aqui') throw Error('CONFIG');
  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  Object.entries({ api_key:key, language:'pt-BR', region:'BR', ...params }).forEach(([k,v]) => url.searchParams.set(k,v));
  return fetchJson(url);
}
async function cached(key, load) {
  if (cache.get(key)?.expires > Date.now()) return cache.get(key).data;
  if (pending.has(key)) return pending.get(key);
  const task = load().then(data => { if(cache.size >= 150) cache.delete(cache.keys().next().value); cache.set(key,{data,expires:Date.now()+(data.partial?60000:DETAIL_TTL)});return data; }).finally(()=>pending.delete(key));
  pending.set(key,task);return task;
}
export function trailerFrom(videos = []) {
  return videos.filter(v => v.site === 'YouTube' && /^[\w-]{11}$/.test(v.key || '') && ['Trailer','Teaser'].includes(v.type))
    .sort((a,b) => Number(b.type === 'Trailer') - Number(a.type === 'Trailer') || Number(b.official) - Number(a.official))[0]?.key || null;
}
export function normalizeDetail(data) {
  const photo = path => path ? `https://image.tmdb.org/t/p/w185${path}` : null;
  const cast = (data.credits?.cast || []).map(p => ({id:p.id,nome:p.name,papel:p.character || '',foto:photo(p.profile_path)}));
  const crew = (data.credits?.crew || []).map(p => ({id:p.id,nome:p.name,papel:p.job || p.department,foto:photo(p.profile_path)}));
  const br = data.release_dates?.results?.find(r=>r.iso_3166_1==='BR')?.release_dates || [];
  const directors = crew.filter(p=>p.papel==='Director').map(p=>p.nome).join(', ');
  return {...normalizeMovie(data), poster:data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null,
    releaseStatus:data.status || '',tagline:data.tagline || '',duracao:data.runtime || null,classificacao:br.find(r=>r.certification)?.certification || null,
    trailer:trailerFrom(data.videos?.results),elenco:cast,equipe:crew,creditos:cast.slice(0,8),
    galeria:(data.images?.backdrops || []).slice(0,12).map(p=>({thumb:`https://image.tmdb.org/t/p/w300${p.file_path}`,src:`https://image.tmdb.org/t/p/w1280${p.file_path}`})),
    informacoes:[{label:'Direção',valor:directors},{label:'Roteiro',valor:[...new Set(crew.filter(p=>['Screenplay','Writer','Story'].includes(p.papel)).map(p=>p.nome))].join(', ')},
      {label:'País',valor:(data.production_countries||[]).map(p=>p.name).join(', ')},
      {label:'Idioma',valor:(data.spoken_languages||[]).map(p=>p.name || p.english_name).join(', ')},
      {label:'Lançamento',valor:data.release_date || ''},{label:'Título original',valor:data.original_title || ''},
      {label:'Duração',valor:data.runtime ? `${data.runtime} min` : ''}].filter(p=>p.valor),
    fonte:'TMDB',fonteUrl:`https://www.themoviedb.org/movie/${data.id}`};
}
export function getMovieDetail(id) {
  return cached(`detail:${id}`,async()=>{
    const data=await request(`movie/${id}`,{append_to_response:'credits,videos,images,release_dates',include_image_language:'pt,en,null'});
    if (!trailerFrom(data.videos?.results)) {
      try { data.videos=await request(`movie/${id}/videos`,{language:'en-US'}); } catch { /* Trailer opcional não bloqueia a ficha. */ }
    }
    return normalizeDetail(data);
  });
}
export function getMovieRelease(id) {
  // Detail pages already include release facts. Reuse them for the subsequent
  // review eligibility check, including a detail request still in flight.
  const release=data=>({id:data.id,categoria:'filmes',estreia:data.estreia||null,releaseStatus:data.releaseStatus||''});
  const detail=cache.get(`detail:${id}`);
  if(detail?.expires>Date.now())return Promise.resolve(release(detail.data));
  if(pending.has(`detail:${id}`))return pending.get(`detail:${id}`).then(release);
  return cached(`release:${id}`, async () => {
    const data = await request(`movie/${id}`);
    return { id: data.id, categoria: 'filmes', estreia: data.release_date || null, releaseStatus: data.status || '' };
  });
}
export function getSimilarMovies(id,page=1) {
  return cached(`related:${id}`,()=>loadRelatedMovies(id)).then(data=>({...data,movies:data.movies.slice((page-1)*20,page*20),page,totalPages:Math.max(1,Math.ceil(data.movies.length/20))}));
}
