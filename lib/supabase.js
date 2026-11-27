import { createClient } from '@supabase/supabase-js';

let client;
export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  if (key.startsWith('sb_secret_')) throw new Error('Use somente uma chave pública.');
  if (key.split('.').length === 3) {
    const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.role !== 'anon') throw new Error('Use somente a chave anon pública.');
  }
  if (!client) client = createClient(url, key, {
    global: { fetch: (input, options = {}) => {
      const timeout = AbortSignal.timeout(12000);
      return fetch(input, { ...options, signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout });
    } },
  });
  return client;
}
