export const MOVIE_LIST_KEY = 'void:movie-watchlist:v1';
export const SERIES_LIST_KEY = 'void:series-watchlist:v1';
export const ANIME_LIST_KEY='void:anime-watchlist:v1';
export const watchlistKey=media=>media==='animes'?ANIME_LIST_KEY:media==='series'?SERIES_LIST_KEY:MOVIE_LIST_KEY;
export function readWatchlist(storage,media='filmes') {
  const data=JSON.parse(storage.getItem(watchlistKey(media))||'{}');
  if(!data||Array.isArray(data)||typeof data!=='object')throw Error('Lista inválida');
  return data;
}
export function setWatchlistItem(storage,item,present) {
  if(!['filmes','series','animes'].includes(item?.categoria)||!/^[1-9][0-9]*$/.test(String(item.id))||typeof item.titulo!=='string')throw Error('Obra inválida');
  const data=readWatchlist(storage,item.categoria);
  if(present)data[item.id]=item;else delete data[item.id];
  storage.setItem(watchlistKey(item.categoria),JSON.stringify(data));
  return data;
}
export function readMovieList(storage) {
  const data = JSON.parse(storage.getItem(MOVIE_LIST_KEY) || '{}');
  if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('Lista inválida');
  return data;
}
export function toggleMovie(storage, movie) {
  if (movie.categoria !== 'filmes' || !/^[1-9][0-9]*$/.test(String(movie.id))) throw new Error('Filme inválido');
  const data = readMovieList(storage);
  if (data[movie.id]) delete data[movie.id]; else data[movie.id] = movie;
  storage.setItem(MOVIE_LIST_KEY, JSON.stringify(data));
  return data;
}
