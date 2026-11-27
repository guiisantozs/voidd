import { fetchJson } from './api.js';
import { normalizeMovie } from './movie-catalog.js';
import {SEARCH_CACHE_MS,normalizeSearchTerm} from './catalog-cache-policy.js';
const cache = new Map();
const pending = new Map();
export function clearMovieSearchCache() { cache.clear(); pending.clear(); }
async function upstream(options, page, now) {
  const key = process.env.TMDB_API_KEY;
  if (!key || key === 'cole_sua_chave_aqui') throw Error('CONFIG');
  const url = new URL(`https://api.themoviedb.org/3/${options.q ? 'search/movie' : 'discover/movie'}`);
  Object.entries({language:'pt-BR',region:'BR',include_adult:'false',page:String(page)}).forEach(([k,v])=>url.searchParams.set(k,v));
  if (options.q) url.searchParams.set('query',normalizeSearchTerm(options.q));
  else { url.searchParams.set('sort_by','popularity.desc'); if (options.genre !== 'all') url.searchParams.set('with_genres',options.genre); }
  if (options.year) url.searchParams.set('primary_release_year',options.year);
  const canonical=new URL(url);if(canonical.searchParams.has('query'))canonical.searchParams.set('query',canonical.searchParams.get('query').toLocaleLowerCase('pt-BR'));
  const cacheKey=canonical.toString();
  const saved=cache.get(cacheKey);
  if (saved && saved.expires > now) return saved.data;
  if (pending.has(cacheKey)) return pending.get(cacheKey);
  url.searchParams.set('api_key',key);
  const task=fetchJson(url).then(data=>{
    if (!Array.isArray(data.results) || !Number.isFinite(data.total_pages)) throw Error('UPSTREAM');
    if(cache.size>=100) cache.delete(cache.keys().next().value);
    cache.set(cacheKey,{data,expires:now+SEARCH_CACHE_MS});return data;
  }).finally(()=>pending.delete(cacheKey));
  pending.set(cacheKey,task);return task;
}
// Compact selectors request exactly one source page; no automatic page scan.
export async function searchMoviePage(options,now=Date.now()){
  const data=await upstream(options,options.page,now);
  return {movies:data.results.filter(item=>!item.adult).map(normalizeMovie),pagination:{page:options.page,hasNext:options.page<Math.min(data.total_pages,500)}};
}
export async function searchMovies(options, now=Date.now()) {
  let page=options.page,offset=options.offset,next=null;
  const movies=[];
  // Scan at most three upstream pages. Cursor retains the exact position, even with sparse genres.
  for(let requests=0;requests<3;requests++) {
    const data=await upstream(options,page,now);
    const lastPage=Math.min(data.total_pages,500);
    if(page>lastPage) { next=null;break; }
    for(;offset<data.results.length;offset++) {
      const movie=data.results[offset];
      if(!movie.adult && (options.genre==='all' || movie.genre_ids?.includes(Number(options.genre)))) movies.push(normalizeMovie(movie));
      if(movies.length===20) { offset++;break; }
    }
    if(offset>=data.results.length) { page++;offset=0; }
    next=page<=lastPage?`${page}:${offset}`:null;
    if(movies.length===20 || !next) break;
  }
  return { movies,next };
}
