export async function prepareMovieReview(client, id, owner) {
  const { data, error } = await client.auth.getSession();
  if (error || data.session?.user?.id !== owner || !data.session?.access_token) throw Error('RELEASE_AUTH');
  const response = await fetch('/api/movie-release', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ id }), signal: AbortSignal.timeout(25000) });
  const result = await response.json();
  if (!response.ok || !result.allowed) throw Object.assign(Error(result.erro || 'Não foi possível confirmar a estreia.'), { code: 'MOVIE_RELEASE' });
  return result.movie;
}
