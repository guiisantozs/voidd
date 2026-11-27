import { parseRating } from './ratings.js';
import { gameGenres } from './game-filters.js';
import { validReleaseDate } from './movie-release.js';

// Configuration: recent successes rather than the all-time popular catalogue.
export const RECOMMENDED_CARD_COUNT = 18;
export const RECOMMENDED_SOURCE_PAGES = 2;
export const RECOMMENDED_CACHE_MS = 5 * 60 * 1000;
export const RECOMMENDED_MAX_AGE_MONTHS = 36;
export const RECOMMENDED_MIN_RATING = 3.5;
export const RECOMMENDED_MIN_VOTES = 50;
export const RECOMMENDED_MIN_ADDED = 500;
export const PERSONAL_MIN_RATING = 4;

const titleKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function gamePreferences(reviews = {}) {
  const played = new Set(), genres = new Map();
  for (const review of Object.values(reviews)) {
    if (review?.item?.categoria !== 'jogos') continue;
    played.add(String(review.item.id));
    const rating = parseRating(review.nota);
    if (!(rating >= PERSONAL_MIN_RATING)) continue;
    for (const genre of gameGenres.filter(genre => review.item.generos?.some(name => genre.names.includes(name)))) genres.set(genre.key, (genres.get(genre.key) || 0) + rating);
  }
  return { played: [...played], genres: [...genres].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([key]) => key) };
}

export function recommendationWindow(now = new Date()) {
  const to = now.toISOString().slice(0, 10), from = new Date(now);
  const day = from.getUTCDate(); from.setUTCDate(1); from.setUTCMonth(from.getUTCMonth() - RECOMMENDED_MAX_AGE_MONTHS);
  const last = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0)).getUTCDate();
  from.setUTCDate(Math.min(day, last));
  return { from: from.toISOString().slice(0, 10), to };
}

export function recommendedGames(games, { excluded = [], platform = 'all', limit = RECOMMENDED_CARD_COUNT, preferences = { played: [], genres: [] }, friends = [], now = new Date() } = {}) {
  const ids = new Set(excluded.map(item => String(item.id)));
  const titles = new Set(excluded.map(item => titleKey(item.titulo || item.title)).filter(Boolean));
  const seen = new Set();
  const liked = new Set(friends.filter(row => row.item?.categoria === 'jogos' && parseRating(row.rating) >= PERSONAL_MIN_RATING).map(row => String(row.item.id)));
  const { from, to } = recommendationWindow(now);
  return games.filter(item => {
    const id = String(item.id);
    if (!/^[1-9]\d*$/.test(id) || !item.titulo || item.categoria !== 'jogos' || ids.has(id) || titles.has(titleKey(item.titulo)) || seen.has(id)) return false;
    if (platform !== 'all' && !item.plataformas?.some(name => name.toLowerCase().includes(platform.toLowerCase()))) return false;
    if (!validReleaseDate(item.estreia) || item.estreia < from || item.estreia > to || preferences.played.includes(id)) return false;
    seen.add(id); return true;
  }).map(item => {
    const similar = gameGenres.some(genre => preferences.genres.includes(genre.key) && item.generos?.some(name => genre.names.includes(name)));
    const friend = liked.has(String(item.id));
    const score = (Number.isFinite(item.nota) ? item.nota : -1) + (similar ? 1 : 0) + (friend ? 1.5 : 0);
    return { ...item, recommendationScore: score, recommendationReason: friend ? 'Bem avaliado por amigos' : similar ? 'Parecido com jogos que você gostou' : '' };
  }).sort((a, b) => b.recommendationScore - a.recommendationScore || b.estreia.localeCompare(a.estreia)).slice(0, limit);
}

export async function loadRecommendedGames(platform, { fetcher = fetch, signal, genre = 'all' } = {}) {
  const games = [];
  for (let page = 1; page <= RECOMMENDED_SOURCE_PAGES; page++) {
    try {
      const params = new URLSearchParams({ platform, genre, page: String(page) });
      const response = await fetcher(`/api/game-recommendations?${params}`, { signal });
      if (!response.ok) throw new Error('RECOMMENDATIONS_UNAVAILABLE');
      const data = await response.json();
      games.push(...(Array.isArray(data.jogos) ? data.jogos : []));
      if (!data.pagination?.hasNext) break;
    } catch (error) {
      if (signal?.aborted || !games.length) throw error;
      return { games, partial: true };
    }
  }
  return { games, partial: false };
}
