import { scopedStorage } from './account-storage.js';

export const categories = [
  { key: 'filmes', label: 'Filmes', singular: 'Filme', endpoint: 'filmes' },
  { key: 'series', label: 'Séries', singular: 'Série', endpoint: 'series' },
  { key: 'jogos', label: 'Jogos', singular: 'Jogo', endpoint: 'jogos' },
  { key: 'animes', label: 'Animes', singular: 'Anime', endpoint: 'anime' },
];

export const itemKey = (item) => `${item.categoria}:${item.id}`;
export const formatRating = (rating) => Number.isFinite(rating)
  ? rating.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—';

export function readReviews() {
  const data = JSON.parse(scopedStorage(localStorage).getItem('void:reviews:v1') || '{}');
  if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('Dados inválidos');
  return data;
}
