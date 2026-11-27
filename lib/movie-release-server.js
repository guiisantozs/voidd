import { createClient } from '@supabase/supabase-js';
import { movieReleaseAllowed } from './movie-release.js';

export async function registerMovieRelease(client, movie) {
  const { error } = await client.from('void_movie_releases').upsert({ movie_id: movie.id, release_date: movie.estreia || null, release_status: movie.releaseStatus || '', checked_at: new Date().toISOString() });
  if (error) throw error;
  return movieReleaseAllowed(movie);
}

export function releaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw Error('RELEASE_CONFIG');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, options = {}) => fetch(input, { ...options, signal: AbortSignal.timeout(12000) }) } });
}
