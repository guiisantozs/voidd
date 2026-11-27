import { gameGenres } from './game-filters.js';
import { parseRating } from './ratings.js';
import { gameStatuses } from './library.js';

export const libraryPlatforms = [{ key: 'pc', label: 'PC' }, { key: 'playstation', label: 'PlayStation' }, { key: 'xbox', label: 'Xbox' }, { key: 'nintendo', label: 'Nintendo' }];
export const libraryOrders = [{ key: 'popular', label: 'Ordem do catálogo' }, { key: 'rating', label: 'Melhores notas' }, { key: 'year', label: 'Mais recentes' }, { key: 'userRating', label: 'Minha nota' }, { key: 'title', label: 'Título (A-Z)' }];
const single = value => typeof value === 'string' ? value : '';
export const normalizeLibraryText = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const slug = value => normalizeLibraryText(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export function libraryGenre(name) {
  const known = gameGenres.find(option => [option.key, option.label, ...option.names].some(value => normalizeLibraryText(value) === normalizeLibraryText(name)));
  return known ? { key: known.key, label: known.label } : { key: slug(name), label: name };
}

export function parseLibraryQuery(query = {}) {
  const status = single(query.status);
  const platform = single(query.platform).toLowerCase();
  const year = value => /^\d{4}$/.test(single(value)) && Number(value) >= 1000 ? value : '';
  const rating = parseRating(single(query.minRating));
  return {
    status: [...gameStatuses.map(option => option.key), 'none'].includes(status) ? status : 'all',
    platform: libraryPlatforms.some(option => option.key === platform) ? platform : '',
    genre: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(single(query.genre)) ? query.genre : '',
    yearFrom: year(query.yearFrom), yearTo: year(query.yearTo),
    minRating: Number.isFinite(rating) ? String(rating) : '',
    q: single(query.q).slice(0, 200),
    order: libraryOrders.some(option => option.key === query.order) ? query.order : 'popular',
  };
}

export function libraryQueryUpdate(current, changes) {
  const next = parseLibraryQuery({ ...parseLibraryQuery(current), ...changes });
  return Object.fromEntries(Object.entries(next).filter(([key, value]) => value !== '' && !(key === 'status' && value === 'all') && !(key === 'order' && value === 'popular')));
}

export function libraryFilterChips(filters, genres) {
  return [
    filters.status !== 'all' && { key: 'status', label: gameStatuses.find(option => option.key === filters.status)?.label || 'Sem status' },
    filters.platform && { key: 'platform', label: libraryPlatforms.find(option => option.key === filters.platform)?.label },
    filters.genre && { key: 'genre', label: genres.find(option => option.key === filters.genre)?.label || filters.genre },
    filters.yearFrom && { key: 'yearFrom', label: `De ${filters.yearFrom}` },
    filters.yearTo && { key: 'yearTo', label: `Até ${filters.yearTo}` },
    filters.minRating !== '' && { key: 'minRating', label: `Nota mínima: ${filters.minRating.replace('.', ',')} / 5` },
    filters.q && { key: 'q', label: `Busca: ${filters.q}` },
  ].filter(Boolean);
}

export function libraryMatchesPlatform(item, platform) {
  if (!platform) return true;
  return item.plataformas?.some(name => {
    const value = normalizeLibraryText(name);
    if (platform === 'pc') return /\b(pc|windows|linux|macos|mac)\b/.test(value);
    if (platform === 'playstation') return value.includes('playstation') || /\bps[1-5]\b/.test(value);
    if (platform === 'nintendo') return /nintendo|switch|wii|gamecube|game boy|\b[23]ds\b/.test(value);
    return value.includes(platform);
  }) || false;
}
