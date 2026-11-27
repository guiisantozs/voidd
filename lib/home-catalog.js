import { movieGenres } from './movie-search-options.js';
import { gameGenres } from './game-filters.js';
import { parseRating } from './ratings.js';

export function homeGenres(item) {
  if (item.categoria === 'jogos') return (item.generos || []).map(name => gameGenres.find(genre => genre.names.includes(name))?.label || name).slice(0, 2);
  return (item.generos?.length ? item.generos : (item.genreIds || []).map(id => movieGenres.find(([key]) => key === String(id))?.[1]).filter(Boolean)).slice(0, 2);
}
const searchable = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
export function homeMatches(item, query = '', category = 'all') {
  return !!item?.titulo && ['filmes', 'jogos'].includes(item.categoria) && (category === 'all' || item.categoria === category)
    && searchable(item.titulo).includes(searchable(query.trim()));
}
export function homeContinue(games = {}, watchlist = {}) {
  const order = { playing: 0, paused: 1, want: 2 }, labels = { playing: 'Jogando', paused: 'Pausado', want: 'Quero jogar' };
  const current = Object.values(games).filter(entry => entry?.item?.categoria === 'jogos' && entry.statusDetail !== 'abandoned' && Object.hasOwn(order, entry.status))
    .sort((a, b) => order[a.status] - order[b.status] || String(b.atualizadoEm || '').localeCompare(String(a.atualizadoEm || '')))
    .map(entry => ({ item: entry.item, label: labels[entry.status] }));
  const seen = new Set(current.map(({ item }) => `${item.categoria}:${item.id}`));
  for (const item of Object.values(watchlist)) {
    if (item?.categoria !== 'filmes' || !item.titulo || seen.has(`filmes:${item.id}`)) continue;
    seen.add(`filmes:${item.id}`); current.push({ item, label: 'Ver depois' });
  }
  return current.slice(0, 12);
}
export function homeWeeklyReviews(rows, now = Date.now()) {
  return rows.filter(row => row.movie?.titulo && Number.isFinite(parseRating(row.rating))
    && Date.parse(row.updated_at) >= now - 7 * 86400000 && Date.parse(row.updated_at) <= now).slice(0, 3);
}
