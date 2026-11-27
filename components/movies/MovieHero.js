import MovieReviewAction from './MovieReviewAction';
import Icon from '../Icon';
import Link from 'next/link';
import CatalogHero from '../CatalogHero';
import { formatRating } from '../../lib/catalog';
import { movieHref } from '../../lib/movie-sections';
import { MovieFailure, MovieImage, rememberMovie, SaveMovie } from './MovieUI';
import {animeDisplayTitle} from '../../lib/anime-titles';
import {animeHeroEligible} from '../../lib/anime-artwork-policy';

export default function MovieHero({ state, retry, media='filmes' }) {
  const anime=media==='animes',series=media==='series'||anime,label=anime?'Animes':series?'Séries':'Filmes';
  const movies = (state?.movies || []).filter(movie=>!anime||animeHeroEligible(movie)).map(movie => ({ ...movie, title: anime ? animeDisplayTitle(movie) : movie.titulo }));
  if (!state || state.loading || state.error || !movies.length) return <section className="void-home-hero void-catalog-hero void-catalog-hero--movies void-catalog-hero--pending" aria-label={`${label} em destaque`}><div className="void-home-hero-inner"><div className="void-home-hero-copy">
    {!state || state.loading ? <div role="status" aria-label="Carregando destaques" className="void-catalog-hero-loading"><div className="m-skeleton"/><div className="m-skeleton"/><div className="m-skeleton"/></div> : state.error ? <><p className="void-home-hero-eyebrow">{series?'SÉRIES NO VOID':'CINEMA NO VOID'}</p><h1>{label}</h1><MovieFailure message={state.error} retry={retry}/></> : <p>Nenhum destaque disponível.</p>}
  </div></div></section>;
  return <CatalogHero items={movies} label={`${label} em destaque`} className={`void-catalog-hero--movies${series?' void-catalog-hero--series':''}${anime?' void-catalog-hero--animes':''}`}
    renderImage={(movie, {priority,onLoad,onError}) => <MovieImage movie={movie} backdrop eager priority={priority} onLoad={onLoad} onError={onError}/>}
    renderContent={movie => <>
      <p className="void-home-hero-eyebrow">{series?'DESTAQUE DA SEMANA':'DESTAQUE VOID'} <span/>{label.toUpperCase()}</p>
      <div className="void-home-hero-selection"><h1 title={movie.titulo}>{movie.title}</h1></div>
      <p className="void-catalog-hero-meta">{Number.isFinite(movie.nota)&&<span><Icon name="star"/> {movie.externalRatingSource||'TMDB'} {formatRating(movie.nota)} / 5</span>}{movie.ano && <span>{movie.ano}</span>}<span>{anime?movie.format||'Anime':series?'Série':'Filme'}</span>{series&&movie.generos?.length>0&&<span>{movie.generos.slice(0,2).join(' · ')}</span>}{series&&movie.numberOfSeasons>0&&<span>{movie.numberOfSeasons} {movie.numberOfSeasons===1?'temporada':'temporadas'}</span>}</p>
      <p className="void-home-hero-description">{movie.sinopse || (anime?'Descubra este anime e registre sua avaliação no VOID.':series?'Descubra esta série e registre sua avaliação no VOID.':'Descubra este filme e registre sua avaliação no VOID.')}</p>
      <div className="void-home-hero-actions"><Link className="void-home-hero-cta" href={movieHref(movie)} onClick={() => rememberMovie(movie)}>Ver detalhes <Icon name="arrow-up-right"/></Link>{series?<SaveMovie movie={movie}/>:<MovieReviewAction movie={movie} onClick={() => rememberMovie(movie)} className="void-home-hero-secondary"><Icon name="star"/> Avaliar</MovieReviewAction>}</div>
    </>}/>;
}
