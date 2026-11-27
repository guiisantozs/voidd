import { useEffect, useState } from 'react';
import { movieReleaseAllowed, movieReleaseMessage, validReleaseDate, releaseDay } from './movie-release';
export function useMovieRelease(movie) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  if (movie?.categoria === 'jogos') return { allowed: validReleaseDate(movie.estreia) && movie.estreia <= releaseDay(now), message: 'A avaliação fica disponível após o lançamento oficial do jogo.' };
  if(movie?.categoria==='animes')return {allowed:validReleaseDate(movie.estreia)&&movie.estreia<=releaseDay(now),message:'A avaliação fica disponível após a estreia confirmada do anime.'};
  return { allowed: movieReleaseAllowed(movie, now), message: movieReleaseMessage(movie) };
}
