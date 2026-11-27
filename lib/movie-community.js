export function recommendationReady(preferences) {
  return (preferences?.qualifying ?? preferences?.count) >= 3 && preferences.genres?.length > 0;
}
export function excludeReviewed(movies, excluded) {
  const ids = new Set((excluded || []).map(String));
  return movies.filter(movie => !ids.has(String(movie.id))).slice(0, 20);
}
export function feedMovies(rows) {
  return (rows || []).map(row => ({ ...row.movie,
    voidNote: row.average == null ? undefined : `Void ${Number(row.average).toFixed(1).replace('.', ',')} / 5 · ${row.total} avaliações`,
    friend: row.display_name ? { name: row.display_name, username: row.username, rating: row.rating } : undefined,
  }));
}
