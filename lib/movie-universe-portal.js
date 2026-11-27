import { franchiseProgress, isReviewed } from './franchise-model.js';

export const universeFilters = [['all', 'Todos'], ['started', 'Em andamento'], ['new', 'Não iniciados'], ['complete', 'Completos']];
export const universeSorts = [['progress', 'Mais progresso'], ['movies', 'Mais filmes'], ['name', 'Ordem alfabética']];
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
export function readUniverseQuery(query = {}) {
  return {
    filter: universeFilters.some(([key]) => key === query.filter) ? query.filter : 'all',
    sort: universeSorts.some(([key]) => key === query.sort) ? query.sort : 'progress',
    search: typeof query.q === 'string' ? query.q.slice(0, 100) : '',
  };
}
export function universeQuery(query, values) {
  const next = { ...query };
  for (const key of ['filter', 'sort', 'q']) delete next[key];
  if (values.filter !== 'all') next.filter = values.filter;
  if (values.sort !== 'progress') next.sort = values.sort;
  if (values.search) next.q = values.search.slice(0, 100);
  return next;
}
export function universePortalRows(franchises, reviews, media='filmes') {
  return franchises.map(row => {
    const ids = [...new Set(row.movieIds || [])];
    const seen = row.error ? 0 : franchiseProgress(ids, reviews, media);
    const total = row.total || 0;
    return { ...row, seen, ratio: total ? seen / total : 0, complete: !row.partial && total > 0 && seen === total };
  });
}
export function universeSummary(rows, reviews, media='filmes') {
  const available = rows.filter(row => !row.error);
  const seenIds = new Set(available.flatMap(row => row.movieIds || []).filter(id => isReviewed(reviews, id, media)));
  // The finish date describes when the film was watched. Editing an old review
  // must not replace a more recently watched film. Save time breaks same-day ties.
  const dated = [...seenIds].map(id => {
    const review = reviews[`${media}:${id}`];
    const saved = Date.parse(review.atualizadoEm) || 0;
    const day = /^\d{4}-\d{2}-\d{2}$/.test(review.data) && Number.isFinite(Date.parse(review.data)) ? review.data : saved ? new Date(saved).toISOString().slice(0,10) : '';
    return {id, day, saved};
  }).filter(row => row.day).sort((a,b) => b.day.localeCompare(a.day) || b.saved-a.saved || b.id-a.id);
  const latest = dated.length ? available.find(row => row.movieIds?.includes(dated[0].id)) : available.find(row => row.seen > 0) || null;
  return {
    started: available.filter(row => row.seen > 0).length, seen: seenIds.size, latest,
    featured: latest || [...available].sort((a, b) => b.total - a.total)[0] || null,
  };
}
export function filterPortalRows(rows, { filter, sort, search }) {
  const needle = normalize(search.trim());
  return rows.filter(row => normalize(row.nome).includes(needle) && (
    filter === 'all' || (!row.error && (filter === 'started' ? row.seen > 0 && !row.complete : filter === 'complete' ? row.complete : row.seen === 0))
  )).sort((a, b) => Number(Boolean(a.error)) - Number(Boolean(b.error)) || (
    sort === 'name' ? a.nome.localeCompare(b.nome, 'pt-BR') : sort === 'movies' ? b.total - a.total : b.seen - a.seen || b.total - a.total
  ));
}
// movieIds already arrive in release order from the existing cached index.
export function nextUniverseMovie(row, reviews, chronology = [], media='filmes') {
  const ids = row.movieIds || [], present = new Set(ids);
  const ordered = [...new Set([...chronology.filter(id => present.has(id)), ...ids])];
  return ordered.find(id => !isReviewed(reviews, id, media)) || null;
}
