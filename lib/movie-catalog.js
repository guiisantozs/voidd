import { fetchJson } from './api.js';
import { movieSectionKeys } from './movie-sections.js';

export const MOVIE_CACHE_TTL = 3600000;
const cache = new Map();
const pending = new Map();
export function clearMovieCache() { cache.clear(); pending.clear(); }
export function movieRequest(section, page = 1) {
  if (!movieSectionKeys.includes(section) || !Number.isInteger(page) || page < 1 || page > 500
    || (section !== 'now-playing' && page !== 1)) throw new Error('INVALID');
  const path = { hero: 'trending/movie/day', 'now-playing': 'movie/now_playing', upcoming: 'movie/upcoming', weekly: 'trending/movie/week' }[section] || 'discover/movie';
  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  url.searchParams.set('language', 'pt-BR');
  url.searchParams.set('region', 'BR');
  url.searchParams.set('page', String(page));
  url.searchParams.set('include_adult', 'false');
  const genre = { drama: '18', scifi: '878', horror: '27', animation: '16' }[section];
  if (genre) { url.searchParams.set('with_genres', genre); url.searchParams.set('sort_by', 'popularity.desc'); }
  if (section === 'classics') {
    url.searchParams.set('primary_release_date.lte', '1999-12-31');
    url.searchParams.set('vote_average.gte', '7');
    url.searchParams.set('vote_count.gte', '500');
    url.searchParams.set('sort_by', 'vote_average.desc');
  }
  return url;
}
export function normalizeMovie(item) {
  return { id: item.id, categoria: 'filmes', genreIds: item.genre_ids || (item.genres || []).map(genre => genre.id), titulo: item.title || item.original_title || 'Sem título',
    sinopse: item.overview || '', ano: (item.release_date || '').slice(0, 4), estreia: item.release_date || null,
    tmdbRating: item.vote_average ?? null, tmdbVoteCount: item.vote_count ?? 0,
    nota: item.vote_count > 0 && Number.isFinite(item.vote_average) ? item.vote_average / 2 : null,
    poster: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null,
    posterPath: item.poster_path || null,
    backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
    backdropPath: item.backdrop_path || null,
  };
}
export async function getMovieSection(section, page = 1, now = Date.now()) {
  const url = movieRequest(section, page);
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey || apiKey === 'cole_sua_chave_aqui') throw new Error('CONFIG');
  const key = `${section}:${page}`;
  const saved = cache.get(key);
  if (saved && now < saved.expires) return saved.data;
  if (pending.has(key)) return pending.get(key);
  url.searchParams.set('api_key', apiKey);
  const task = fetchJson(url).then(data => {
    const movies = (data.results || []).filter(item => !item.adult).map(normalizeMovie);
    const result = { movies: section === 'hero' ? movies.slice(0, 5) : movies,
      page, totalPages: Math.min(Number(data.total_pages) || 1, 500) };
    if (cache.size >= 80) cache.delete(cache.keys().next().value);
    cache.set(key, { data: result, expires: now + MOVIE_CACHE_TTL });
    return result;
  }).finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}
