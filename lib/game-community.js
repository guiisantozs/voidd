import { withIdentities } from './usernames.js';

export const GAME_REVIEW_PAGE_SIZE = 20;
export async function loadGameReviews(client, id, { sort = 'recent', offset = 0, friendsOnly = false } = {}) {
  const key = `jogos:${id}`;
  let rows, total;
  if (sort === 'highest' || sort === 'lowest') {
    // Order in Postgres before pagination; JSON numeric ratings stay on the /5 scale.
    const result = await client.from('void_records').select('user_id,payload,updated_at', { count: 'exact' })
      .eq('kind', 'review').eq('item_key', key).eq('is_public', true)
      .not('payload', 'is', null).order('payload->nota', { ascending: sort === 'lowest' })
      .order('updated_at', { ascending: false }).order('user_id').range(offset, offset + GAME_REVIEW_PAGE_SIZE - 1);
    if (result.error) throw result.error;
    rows = (result.data || []).map(row => ({ user_id: row.user_id, rating: row.payload.nota,
      text: row.payload.texto || '', spoiler: !!row.payload.spoiler, updated_at: row.updated_at,
      ...reviewExtras(row.payload) })); total = result.count || 0;
  } else {
    const { data, error } = await client.rpc('void_movie_review_page_v2', {
      movie_key: key, sort_by: sort === 'likes' ? 'likes' : 'recent', friends_only: friendsOnly, page_offset: offset,
    });
    if (error) throw error;
    rows = data.reviews || []; total = data.total;
    if (rows.length) {
      const extras = await client.from('void_records').select('user_id,payload').eq('kind', 'review')
        .eq('item_key', key).eq('is_public', true).in('user_id', rows.map(row => row.user_id));
      if (extras.error) throw extras.error;
      const visible = new Map((extras.data || []).filter(row => row.payload).map(row => [row.user_id, row.payload]));
      rows = rows.filter(row => visible.has(row.user_id)).map(row => ({ ...row, ...reviewExtras(visible.get(row.user_id)) }));
    }
  }
  return { rows: await withIdentities(client, rows), total };
}
function reviewExtras(payload) {
  return { recommendation: payload.recommendation, positives: payload.positives, negatives: payload.negatives };
}

export async function gameReviewLikes(client, key, author, viewer) {
  const countQuery = client.from('void_review_likes').select('user_id', { count: 'exact', head: true })
    .eq('item_key', key).eq('review_user', author);
  const [count, mine] = await Promise.all([countQuery, viewer
    ? client.from('void_review_likes').select('user_id').eq('item_key', key).eq('review_user', author).eq('user_id', viewer).maybeSingle()
    : Promise.resolve({ data: null })]);
  if (count.error || mine.error) throw count.error || mine.error;
  return { likes: count.count || 0, liked: !!mine.data };
}
