export const movieThemes = [
  { key: 'drama', title: 'Para chorar', icon: 'heart' },
  { key: 'scifi', title: 'Ficção científica', icon: 'sparkle' },
  { key: 'horror', title: 'Terror', icon: 'moon' },
  { key: 'animation', title: 'Animação', icon: 'diamond' },
  { key: 'classics', title: 'Clássicos', icon: 'clock' },
];
export const movieSectionKeys = ['hero', 'now-playing', 'upcoming', 'weekly', ...movieThemes.map(theme => theme.key)];
export const movieHref = movie => movie.categoria&&movie.categoria!=='filmes'?`/obra/${movie.categoria}/${movie.id}`:`/filme/${movie.id}`;
export const movieReviewHref = movie => movie.categoria==='animes'?{pathname:`/obra/animes/${movie.id}`,query:{tab:'reviews'}}:({ pathname: '/avaliar', query: { categoria: movie.categoria||'filmes', id: movie.id } });

export function brazilDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function daysUntilRelease(date, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  const release = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(release)) return null;
  return Math.round((release - Date.parse(`${brazilDay(now)}T00:00:00Z`)) / 86400000);
}
export function releaseLabel(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return 'Data a confirmar';
  const time = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(time.getTime()) ? 'Data a confirmar' : time.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short', year: 'numeric' });
}
