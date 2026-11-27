import { fetchJson } from './api.js';
import { normalizeMovie, MOVIE_CACHE_TTL } from './movie-catalog.js';

// Only public TMDB candidates are shared; user preferences/exclusions are never cached here.
const cache = new Map();
const pending = new Map();
export async function recommendationCandidates(genres, now = Date.now()) {
  const genreKey = [...new Set(genres.map(String).filter(id => /^\d+$/.test(id)))].sort().join('|');
  if (!genreKey || !process.env.TMDB_API_KEY) throw new Error('CONFIG');
  const cached = cache.get(genreKey);
  if (cached && cached.expires > now) return cached.movies;
  if (pending.has(genreKey)) return pending.get(genreKey);
  const task = Promise.all([1, 2, 3].map(async page => {
    const endpoint = new URL('https://api.themoviedb.org/3/discover/movie');
    Object.entries({ api_key: process.env.TMDB_API_KEY, language: 'pt-BR', region: 'BR', include_adult: 'false',
      with_genres: genreKey, sort_by: 'popularity.desc', page: String(page) })
      .forEach(([name, value]) => endpoint.searchParams.set(name, value));
    const response = await fetchJson(endpoint);
    return (response.results || []).filter(movie => !movie.adult).map(normalizeMovie);
  })).then(results => {
    const movies = [...new Map(results.flat().map(movie => [movie.id, movie])).values()];
    if (cache.size >= 40) cache.delete(cache.keys().next().value);
    cache.set(genreKey, { movies, expires: now + MOVIE_CACHE_TTL });
    return movies;
  }).finally(() => pending.delete(genreKey));
  pending.set(genreKey, task);
  return task;
}
