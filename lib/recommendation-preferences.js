import {normalizeReview,parseRating} from './ratings.js';
import {fetchJson} from './api.js';
import {movieGenres} from './movie-search-options.js';

const validGenres=new Set(movieGenres.map(([id])=>id));
const genresOf=value=>Array.isArray(value)?[...new Set(value.map(String).filter(id=>validGenres.has(id)))]:[];
// Cache only public catalogue facts, never a user's ratings, history or preferences.
const cache=new Map(),pending=new Map();
export async function movieGenreIds(id){
 if(!/^[1-9]\d{0,14}$/.test(String(id)))throw Error('INVALID');
 const saved=cache.get(String(id));if(saved?.expires>Date.now())return saved.genres;
 if(pending.has(String(id)))return pending.get(String(id));
 const task=(async()=>{
  if(!process.env.TMDB_API_KEY)throw Error('CONFIG');
  const url=new URL(`https://api.themoviedb.org/3/movie/${id}`);url.searchParams.set('api_key',process.env.TMDB_API_KEY);url.searchParams.set('language','pt-BR');
  const data=await fetchJson(url),genres=genresOf(data.genres?.map(g=>g.id));
  if(cache.size>=500)cache.delete(cache.keys().next().value);
  cache.set(String(id),{genres,expires:Date.now()+86400000});return genres;
 })().finally(()=>pending.delete(String(id)));
 pending.set(String(id),task);return task;
}

export async function ownMovieReviews(client,userId){
 const rows=[];
 for(let offset=0;;offset+=500){
  const {data,error}=await client.from('void_records').select('item_key,payload').eq('user_id',userId).eq('kind','review').like('item_key','filmes:%').not('payload','is',null).order('item_key').range(offset,offset+499);
  if(error)throw error;rows.push(...data);if(data.length<500)return rows;
 }
}

export async function recommendationPreferences(rows,loadGenres=movieGenreIds){
 const mine=rows.filter(row=>/^filmes:[1-9]\d*$/.test(row.item_key)&&row.payload).map(row=>({id:row.item_key.slice(7),review:normalizeReview(row.payload)}));
 const high=mine.filter(({review})=>parseRating(review.nota)>=4);
 const result={count:mine.length,qualifying:high.length,excluded:mine.map(row=>row.id),genres:[]};
 if(high.length<3)return result;
 // Every qualifying review participates; bound concurrency and share only public metadata.
 let cursor=0;const votes=new Map();
 await Promise.all(Array.from({length:Math.min(4,high.length)},async()=>{
  while(cursor<high.length){const row=high[cursor++];let genres=genresOf(row.review.item?.genreIds);
   if(!genres.length)genres=await loadGenres(row.id);
   for(const id of genresOf(genres))votes.set(id,(votes.get(id)||0)+1);
  }
 }));
 result.genres=[...votes].sort((a,b)=>b[1]-a[1]||Number(a[0])-Number(b[0])).slice(0,3).map(([id])=>id);
 return result;
}

export function recommendationReason(movie,genres){
 const match=movieGenres.find(([id])=>genres.includes(id)&&movie.genreIds?.map(String).includes(id));
 return match?`Gênero: ${match[1]}`:null;
}
