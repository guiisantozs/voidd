import CinematicMovieUniverse from './CinematicMovieUniverse';
import {movieUniverseLandings} from '../../config/movie-universe-landings';

export default function HarryPotterUniverse(props) {
 return <CinematicMovieUniverse {...props} landing={movieUniverseLandings['harry-potter']}/>;
}
