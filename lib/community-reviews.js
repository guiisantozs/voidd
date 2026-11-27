import { reviewReactions } from './reactions.js';
import { withIdentities } from './usernames.js';

export const COMMUNITY_PAGE_SIZE = 12;
export function reviewSearch(value) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ').slice(0, 100) : '';
}
export function reviewWindow(now = new Date()) {
  const end = new Date(now);
  if (!Number.isFinite(end.getTime())) throw new Error('Data inválida');
  return { start: new Date(end.getTime() - 30 * 86400000).toISOString(), end: end.toISOString() };
}
export async function loadCommunityReviews(client, { query = '', page = 0, audience = 'community', now = new Date(), signal } = {}) {
  if (!client || !['community', 'friends'].includes(audience) || !Number.isInteger(page) || page < 0 || page > 100000) throw new Error('Consulta inválida');
  const window = reviewWindow(now);
  // Friendship is checked against auth.uid() inside the database, never against
  // a caller-supplied owner or a client-generated list of followers.
  const source = audience === 'friends'
    ? client.rpc('void_confirmed_friend_reviews', {}, { count: 'exact' })
    : client.from('void_records');
  // Explicit public filter also excludes the caller's own private reviews.
  // The existing records RLS additionally enforces each profile's visibility.
  let request = source
    .select('user_id,item_key,updated_at,movie:payload->item,rating:payload->nota,text:payload->>texto,spoiler:payload->spoiler', { count: 'exact' })
    .eq('kind', 'review').eq('is_public', true).like('item_key', 'filmes:%')
    .gte('updated_at', window.start).lte('updated_at', window.end)
    .order('updated_at', { ascending: false }).order('user_id', { ascending: false }).order('item_key', { ascending: false });
  const term = reviewSearch(query);
  if (term) request = request.ilike('payload->item->>titulo', `%${term.replace(/[\\%_]/g, '\\$&')}%`);
  request = request.range(page * COMMUNITY_PAGE_SIZE, (page + 1) * COMMUNITY_PAGE_SIZE - 1);
  if (signal) request = request.abortSignal(signal);
  const { data, count, error } = await request;
  if (error) throw error;
  const rows = await reviewReactions(client, await withIdentities(client, data || []), signal);
  return { rows, total: count ?? 0 };
}
