import {normalizeSearchTerm,shortSearch} from './catalog-cache-policy.js';
export const movieGenres = [
  ['28','Ação'],['12','Aventura'],['16','Animação'],['35','Comédia'],['80','Crime'],['99','Documentário'],['18','Drama'],['10751','Família'],['14','Fantasia'],['878','Ficção científica'],['10752','Guerra'],['36','História'],['9648','Mistério'],['10402','Música'],['10749','Romance'],['53','Suspense'],['27','Terror'],['10770','Cinema TV'],['37','Faroeste'],
];
export function parseMovieSearch(input = {},genres=movieGenres) {
  const result = {};
  for (const [key, fallback] of Object.entries({ q:'', genre:'all', year:'', cursor:'1:0' })) {
    const value = input[key] ?? fallback;
    if (typeof value !== 'string') throw Error('INVALID');
    result[key] = value.trim();
  }
  result.q=normalizeSearchTerm(result.q);
  if (result.q.length > 100 || shortSearch(result.q) || !['all',...genres.map(([id])=>id)].includes(result.genre)
    || (result.year && (!/^\d{4}$/.test(result.year) || +result.year < 1874 || +result.year > 2099))
    || !/^[1-9]\d{0,2}:(?:[0-9]|1[0-9])$/.test(result.cursor)) throw Error('INVALID');
  const [page,offset] = result.cursor.split(':').map(Number);
  if (page > 500) throw Error('INVALID');
  return { ...result, page, offset };
}
