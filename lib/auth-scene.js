import { fetchJson } from './api.js';

export const AUTH_SCENE_TTL = 6 * 60 * 60 * 1000;
let saved;
let pending;
export function clearAuthSceneCache() { saved = undefined; pending = undefined; providersCache = undefined; }
export async function authPosters(now = Date.now()) {
  if (saved && saved.expires > now) return saved.posters;
  if (pending) return pending;
  const key = process.env.TMDB_API_KEY;
  if (!key || key === 'cole_sua_chave_aqui') return [];
  const url = new URL('https://api.themoviedb.org/3/trending/all/week');
  url.searchParams.set('api_key', key);
  url.searchParams.set('language', 'pt-BR');
  pending = fetchJson(url).then(data => {
    const posters = [...new Set((data.results || []).filter(item => !item.adult && ['movie', 'tv'].includes(item.media_type)
      && /^\/[A-Za-z0-9_-]+\.(jpg|png|webp)$/.test(item.poster_path || '')).map(item => `https://image.tmdb.org/t/p/w185${item.poster_path}`))].slice(0, 20);
    saved = { posters, expires: now + AUTH_SCENE_TTL }; return posters;
  }).finally(() => { pending = undefined; });
  return pending;
}
let providersCache;
export async function configuredAuthProviders(now = Date.now()) {
  if (providersCache && providersCache.expires > now) return providersCache.providers;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return [];
  const settings = await fetchJsonWithKey(`${url}/auth/v1/settings`, key);
  const providers = ['google', 'discord'].filter(provider => settings.external?.[provider] === true);
  providersCache = { providers, expires: now + 300000 }; return providers;
}
async function fetchJsonWithKey(url, key) {
  const response = await fetch(url, { headers: { apikey: key }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('SETTINGS');
  return response.json();
}
