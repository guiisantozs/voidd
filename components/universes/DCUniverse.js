import CinematicMovieUniverse from './CinematicMovieUniverse';
import {movieUniverseLandings} from '../../config/movie-universe-landings';
import PosterRow from '../movies/PosterRow';
import {MovieCard} from '../movies/MovieUI';
import Icon from '../Icon';
import {dcShelfDefinitions} from '../../config/dc-universe';
import {dcShelves} from '../../lib/dc-universe';
import {isReviewed} from '../../lib/franchise-model';
import {formatRating} from '../../lib/catalog';

export default function DCUniverse(props) {
 const {data,reviews,user,today,filter,setFilter}=props;
 const rows=dcShelves(data.movies,{today,filter:user?filter:'all',reviews});
 function renderCard(movie) {
  const upcoming=!movie.estreia||!today||movie.estreia>today;
  return <div className="dc-shelf-movie" key={movie.id}><MovieCard movie={movie} upcoming={upcoming} now={today?new Date(`${today}T12:00:00-03:00`):undefined}/>{user&&isReviewed(reviews,movie.id)&&<span className="u-seen-badge"><Icon name="check"/> Visto · {formatRating(reviews[`filmes:${movie.id}`].nota)} / 5</span>}</div>;
 }
 return <><CinematicMovieUniverse {...props} landing={movieUniverseLandings.dc} showNavigation={false}/>
  <nav className="sw-nav dc-section-nav" aria-label="Seleções do universo DC">{dcShelfDefinitions.map(shelf=><a key={shelf.key} href={`#${shelf.id}`}>{shelf.title}</a>)}<a href="#dc-filmes">Catálogo completo<Icon name="arrow-right"/></a></nav>
  <div className="m-container dc-shelves">
   <div className="dc-shelves-heading"><div><p className="sw-eyebrow">ENCONTRE SEU PRÓXIMO HERÓI</p><h2>Explore o universo DC</h2></div><label htmlFor="dc-shelf-filter">Mostrar<select id="dc-shelf-filter" value={user?filter:'all'} onChange={event=>setFilter(event.target.value)}><option value="all">Todos os filmes</option><option value="seen" disabled={!user}>Vistos</option><option value="unseen" disabled={!user}>Não vistos</option></select></label></div>
   {data.partial&&<p className="u-hint" role="status">Parte do catálogo está temporariamente indisponível. As seleções mostram os filmes disponíveis.</p>}
   {dcShelfDefinitions.map(shelf=><div className="dc-shelf" id={shelf.id} key={shelf.key}><PosterRow title={shelf.title} icon={shelf.icon} sectionKey={`dc-${shelf.key}`} state={{movies:rows[shelf.key]}} intro={<p className="dc-shelf-intro">{shelf.intro}</p>} renderCard={renderCard} empty={<div className="dc-shelf-empty"><Icon name="film"/><p>{user&&filter!=='all'?'Nenhum filme com este filtro nesta seleção.':'Ainda não há filmes disponíveis nesta seleção.'}</p>{filter!=='all'&&<button type="button" onClick={()=>setFilter('all')}>Mostrar todos</button>}</div>}/></div>)}
  </div>
 </>;
}
