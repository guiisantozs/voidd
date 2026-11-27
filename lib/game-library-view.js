import { gameStatuses, gameStatusKey, libraryGames } from './library.js';
import { itemKey } from './catalog.js';
import { parseRating } from './ratings.js';
import { libraryGenre, libraryMatchesPlatform, normalizeLibraryText } from './game-library-filters.js';

export const libraryFilters = [{ key: 'all', label: 'Todos' }, ...gameStatuses, { key: 'none', label: 'Sem status' }];
export const libraryFilter = value => libraryFilters.some(option => option.key === value) ? value : 'all';
export const libraryStatus = (item, entries) => gameStatusKey(entries[String(item.id)]) || 'none';
export const libraryShelfOrder = ['playing_now', 'playing', 'want', 'paused', 'finished', 'platinum', 'abandoned', 'none'];
export const libraryEmpty = {
  all: 'Sua biblioteca começa com o próximo jogo. Explore o catálogo e escolha o que quer jogar.',
  want: 'Sua próxima aventura está esperando. Explore jogos e salve o que quer jogar.',
  playing: 'Nada em andamento. Que tal começar algo da sua lista de Quero jogar?',
  playing_now: 'Nenhum jogo marcado como Jogando agora. Você pode atualizar sua atividade manualmente quando começar uma sessão.',
  finished: 'Nenhum jogo finalizado ainda. Cada jornada tem seu tempo.',
  paused: 'Nenhuma jornada em pausa. Seus jogos pausados aparecerão aqui.',
  platinum: 'Nenhum jogo platinado ainda. Suas conquistas de 100% aparecerão aqui.',
  abandoned: 'Nenhum jogo abandonado. Você pode registrar aqui as jornadas que deixou para trás.',
  none: 'Todos os seus jogos avaliados já têm status. Novas avaliações sem classificação aparecerão aqui.',
};

export function gameLibraryView(entries, reviews, { status = 'all', query = '', q = query, order = 'popular', platform = '', genre = '', yearFrom = '', yearTo = '', minRating = '' } = {}) {
  const owned = libraryGames(entries, reviews);
  const count = games => {
    const result = Object.fromEntries(libraryFilters.map(option => [option.key, 0]));
    result.all = games.length;
    for (const item of games) result[libraryStatus(item, entries)]++;
    return result;
  };
  const totalCounts = count(owned);
  const score = item => {
    const rating = parseRating(reviews[itemKey(item)]?.nota);
    return Number.isFinite(rating) ? rating : -1;
  };
  const matched = owned.filter(item => normalizeLibraryText(item.titulo).includes(normalizeLibraryText(q.trim()))
    && libraryMatchesPlatform(item, platform)
    && (!genre || item.generos?.some(name => libraryGenre(name).key === genre))
    && (!yearFrom || Number(item.ano) >= Number(yearFrom))
    && (!yearTo || (Number(item.ano) > 0 && Number(item.ano) <= Number(yearTo)))
    && (minRating === '' || score(item) >= Number(minRating)));
  const counts = count(matched);
  const items = matched.filter(item => status === 'all' || libraryStatus(item, entries) === status);
  if (order === 'rating') items.sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1));
  if (order === 'userRating') items.sort((a, b) => score(b) - score(a));
  if (order === 'year') items.sort((a, b) => Number(b.ano || 0) - Number(a.ano || 0));
  if (order === 'title') items.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR', { sensitivity: 'base', numeric: true }));
  const ratings = owned.map(item => parseRating(reviews[itemKey(item)]?.nota)).filter(Number.isFinite);
  const summary = {
    average: ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : null,
    rated: ratings.length,
    completed: totalCounts.finished + totalCounts.platinum,
    percent: owned.length ? Math.round((totalCounts.finished + totalCounts.platinum) / owned.length * 100) : 0,
  };
  const playing = owned.filter(item => libraryStatus(item, entries) === 'playing_now');
  const shelves = libraryShelfOrder.map(key => ({
    key, label: libraryFilters.find(option => option.key === key).label,
    items: items.filter(item => libraryStatus(item, entries) === key),
  })).filter(shelf => shelf.items.length);
  const genres = [...new Map(owned.flatMap(item => (item.generos || []).map(libraryGenre)).map(option => [option.key, option])).values()].filter(option => option.key).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  return { items, counts, totalCounts, summary, playing, shelves, genres };
}
