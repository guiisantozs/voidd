export const RELEASE_TIMEZONE = 'America/Sao_Paulo';
export function releaseDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: RELEASE_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function validReleaseDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
}
export function movieReleaseAllowed(movie, now = new Date()) {
  if (movie?.categoria && movie.categoria !== 'filmes') return true;
  return validReleaseDate(movie?.estreia) ? movie.estreia <= releaseDay(now) : movie?.releaseStatus === 'Released';
}
export function movieReleaseMessage(movie) {
  return validReleaseDate(movie?.estreia)
    ? `Este filme ainda não foi lançado. Você poderá avaliá-lo a partir de ${movie.estreia.split('-').reverse().join('/')}.`
    : 'Este filme ainda não tem uma data de estreia confirmada. A avaliação estará disponível após a confirmação do lançamento.';
}
