import { withIdentities } from './usernames.js';
import { parseRating } from './ratings.js';

export function groupFriendMovies(movies, reviews, media='filmes') {
  return [...new Map(movies.map(movie => [String(movie.id), movie])).values()].map(movie => {
    const unique = new Map();
    for (const review of reviews.filter(row => row.item_key === `${media}:${movie.id}`).sort((a, b) => b.updated_at.localeCompare(a.updated_at))) {
      if (!unique.has(review.user_id)) unique.set(review.user_id, review);
    }
    const friends = [...unique.values()];
    const ratings = friends.map(friend => parseRating(friend.rating)).filter(Number.isFinite);
    return { ...movie, friends, friendAverage: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null, friendUpdated: friends[0]?.updated_at || '' };
  }).filter(movie => movie.friends.length).sort((a, b) => b.friendUpdated.localeCompare(a.friendUpdated));
}

// Supplement only the existing carousel's titles. Reuse the current authorized
// friends-only review RPC, including its pagination; no new SQL or access rules.
export async function loadFriendMovieCards(client, movies, signal) {
  const unique = [...new Map(movies.map(movie => [String(movie.id), movie])).values()];
  const rows = [];
  for (let start = 0; start < unique.length; start += 3) {
    signal?.throwIfAborted();
    const batches = await Promise.all(unique.slice(start, start + 3).map(async movie => {
      const reviews = [];
      for (let offset = 0; ; offset += 20) {
        signal?.throwIfAborted();
        const request = client.rpc('void_movie_review_page_v2', { movie_key: `filmes:${movie.id}`, friends_only: true, sort_by: 'recent', page_offset: offset });
        const { data, error } = await (signal ? request.abortSignal(signal) : request);
        if (error) throw error;
        const page = data?.reviews || [];
        reviews.push(...page.map(row => ({ ...row, item_key: `filmes:${movie.id}` })));
        if (!page.length || reviews.length >= data.total) return reviews;
      }
    }));
    rows.push(...batches.flat());
  }
  // Resolve identities once per 50 distinct users, rather than once per card.
  const ids = [...new Set(rows.map(row => row.user_id))], identities = new Map();
  for (let start = 0; start < ids.length; start += 50) {
    signal?.throwIfAborted();
    const people = await withIdentities(client, ids.slice(start, start + 50).map(user_id => ({ user_id })));
    for (const person of people) identities.set(person.user_id, person);
  }
  return groupFriendMovies(unique, rows.map(row => ({ ...row, ...identities.get(row.user_id) })));
}
