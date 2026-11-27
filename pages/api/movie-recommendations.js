import { createClient } from '@supabase/supabase-js';
import { recommendationCandidates } from '../../lib/movie-recommendations.js';
import { excludeReviewed, recommendationReady } from '../../lib/movie-community.js';
import { ownMovieReviews,recommendationPreferences,recommendationReason } from '../../lib/recommendation-preferences.js';
import {getMovieSection} from '../../lib/movie-catalog.js';

// No shared cache: preferences and exclusions belong exclusively to the caller.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ erro: 'Método não permitido.' }); }
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return res.status(401).json({ erro: 'Entre para receber recomendações.' });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !process.env.TMDB_API_KEY) return res.status(503).json({ erro: 'Recomendações não configuradas.' });
  try {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` }, fetch: (input, options = {}) => fetch(input, { ...options, signal: AbortSignal.timeout(12000) }) } });
    const { data: auth, error: authError } = await client.auth.getUser(token);
    if (authError || !auth.user) return res.status(401).json({ erro: 'Entre novamente para continuar.' });
    const data=await recommendationPreferences(await ownMovieReviews(client,auth.user.id));
    const progress={count:data.count,qualifying:data.qualifying,minimum:3};
    if (!recommendationReady(data)) {
      const fallback=await getMovieSection('weekly');
      return res.json({ movies: excludeReviewed(fallback.movies,data.excluded), insufficient:data.qualifying<3, noGenres:data.qualifying>=3, fallback:true, progress });
    }
    const candidates = await recommendationCandidates(data.genres);
    return res.json({ movies: excludeReviewed(candidates, data.excluded).map(movie=>({...movie,recommendationReason:recommendationReason(movie,data.genres)})), progress });
  } catch { return res.status(502).json({ erro: 'Não foi possível carregar suas recomendações.' }); }
}
