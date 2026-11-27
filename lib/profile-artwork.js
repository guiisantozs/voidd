import { fetchJson } from './api.js';
const cache = new Map(), pending = new Map();
export function parseArtworkId(id) {
  if (typeof id !== 'string' || !/^[1-9]\d{0,8}$/.test(id)) throw Error('INVALID');
  return id;
}
export async function movieArtwork(id, now = Date.now()) {
  if (cache.get(id)?.expires > now) return cache.get(id).data;
  if (pending.has(id)) return pending.get(id);
  const key = process.env.TMDB_API_KEY;
  if (!key || key === 'cole_sua_chave_aqui') throw Error('CONFIG');
  const task = (async () => {
    const url = new URL(`https://api.themoviedb.org/3/movie/${id}`);
    Object.entries({api_key:key, language:'pt-BR', append_to_response:'images', include_image_language:'pt,en,null'}).forEach(([k,v])=>url.searchParams.set(k,v));
    const movie = await fetchJson(url);
    if (movie.adult) return {images:[]};
    const image = (path, type) => ({url:`https://image.tmdb.org/t/p/${type === 'poster' ? 'w780' : 'w1280'}${path}`,thumb:`https://image.tmdb.org/t/p/${type === 'poster' ? 'w185' : 'w300'}${path}`,type});
    const valid = path => typeof path === 'string' && /^\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(path);
    const group = (type, rows, fallback) => [...new Set([fallback, ...(rows||[]).map(p=>p.file_path)].filter(valid))].slice(0,12).map(p=>image(p,type));
    const data = {images:[...group('backdrop',movie.images?.backdrops,movie.backdrop_path),...group('poster',movie.images?.posters,movie.poster_path)]};
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(id,{expires:now+86400000,data});
    return data;
  })().finally(()=>pending.delete(id));
  pending.set(id,task);
  return task;
}
