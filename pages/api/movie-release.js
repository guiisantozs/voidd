import { createClient } from '@supabase/supabase-js';
import { getMovieRelease } from '../../lib/movie-detail';
import { registerMovieRelease, releaseAdmin } from '../../lib/movie-release-server';
import { movieReleaseMessage } from '../../lib/movie-release';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ erro: 'Método não permitido.' }); }
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return res.status(401).json({ erro: 'Entre novamente para avaliar.' });
  const id = req.body?.id;
  if (!/^[1-9][0-9]{0,9}$/.test(String(id))) return res.status(400).json({ erro: 'Filme inválido.' });
  try {
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ erro: 'Entre novamente para avaliar.' });
    const { error: budget } = await client.rpc('void_movie_release_budget');
    if (budget) throw budget;
    const movie = await getMovieRelease(id);
    const allowed = await registerMovieRelease(releaseAdmin(), movie);
    return res.status(allowed ? 200 : 409).json({ allowed, movie, ...(!allowed ? { erro: movieReleaseMessage(movie) } : {}) });
  } catch (error) {
    return res.status(error.message === 'RELEASE_CONFIG' ? 503 : 502).json({ erro: 'Não foi possível confirmar a estreia do filme. Tente novamente antes de salvar.' });
  }
}
