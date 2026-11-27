import { useEffect, useState } from 'react';
import { loadRecommendedGames, RECOMMENDED_CACHE_MS } from './game-recommendations';

// Public catalogue data only; never cache or infer a user's private library here.
const cache = new Map();
export function useGameRecommendations({ platform, enabled, genre = 'all' }) {
  const [state, setState] = useState({ platform: null, games: [], loading: true });
  const [attempt, setAttempt] = useState(0);
  const key = `${platform}:${genre}`;
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const stored = cache.get(key);
    if (stored && stored.expires > Date.now()) { setState({ ...stored.data, platform: key, loading: false }); return; }
    setState({ platform: key, games: [], loading: true });
    loadRecommendedGames(platform, { genre, signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      if (!data.partial) { if (cache.size >= 30) cache.delete(cache.keys().next().value); cache.set(key, { data, expires: Date.now() + RECOMMENDED_CACHE_MS }); }
      setState({ ...data, platform: key, loading: false });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ platform: key, games: [], loading: false, error: 'Não foi possível carregar as recomendações do catálogo.' });
    });
    return () => controller.abort();
  }, [platform, genre, enabled, attempt]);
  return { ...(state.platform === key ? state : { games: [], loading: true }), retry: () => { cache.delete(key); setAttempt(value => value + 1); } };
}
