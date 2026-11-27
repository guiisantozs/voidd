import CinematicMovieUniverse from './CinematicMovieUniverse';
import {movieUniverseLandings} from '../../config/movie-universe-landings';

export default function StarWarsUniverse(props) {
 return <CinematicMovieUniverse {...props} landing={movieUniverseLandings['star-wars']}/>;
}
