export async function reviewReactions(client, rows, signal) {
  if (!rows.length) return rows;
  let request = client.rpc('void_review_reactions', { targets: rows.map(row => ({ review_user: row.user_id, item_key: row.item_key })) });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) return rows.map(row => ({ ...row, reactionUnavailable: true }));
  const byReview = new Map((data || []).map(row => [`${row.review_user}:${row.item_key}`, row]));
  return rows.map(row => ({ ...row, ...(byReview.get(`${row.user_id}:${row.item_key}`) || { likes: 0, liked: false }) }));
}

export async function setReaction(client, owner, { listId, reviewUser, itemKey }, present) {
  const table = listId ? 'list_likes' : 'void_review_likes';
  const target = listId ? { list_id: listId } : { review_user: reviewUser, item_key: itemKey };
  let request;
  // Upsert is deliberately avoided: these tables only grant INSERT/DELETE.
  if (present) request = client.from(table).insert({ ...target, user_id: owner });
  else {
    request = client.from(table).delete().eq('user_id', owner);
    for (const [key, value] of Object.entries(target)) request = request.eq(key, value);
  }
  const { error } = await request;
  if (error && !(present && error.code === '23505')) throw error;
}
