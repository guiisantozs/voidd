import {dcUniverse} from '../config/dc-universe.js';
import {isReviewed,orderFranchiseMovies} from './franchise-model.js';

const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

export function dcShelves(movies=[],{today='',filter='all',reviews={}}={}) {
 const unique=[...new Map(movies.map(movie=>[movie.id,movie])).values()];
 const visible=unique.filter(movie=>filter==='all'||(filter==='seen'?isReviewed(reviews,movie.id):!isReviewed(reviews,movie.id)));
 const release=orderFranchiseMovies(visible);
 const released=release.filter(movie=>movie.estreia&&today&&movie.estreia<=today);
 const future=release.filter(movie=>!movie.estreia||!today||movie.estreia>today);
 return {
  dcu:release.filter(movie=>dcUniverse.dcu.includes(movie.id)),
  recent:[...released].reverse().concat(future),
  animation:release.filter(movie=>movie.genreIds?.includes(16)),
  batman:release.filter(movie=>dcUniverse.batman.includes(movie.id)||/\bbatman\b|\bcavaleiro das trevas\b/.test(normalize(movie.titulo))),
  superman:release.filter(movie=>dcUniverse.superman.includes(movie.id)||/\bsuperman\b|\bsuper homem\b|\bhomem de aco\b/.test(normalize(movie.titulo))),
 };
}
