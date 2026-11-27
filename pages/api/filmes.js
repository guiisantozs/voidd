import { catalogHandler, tmdb } from '../../lib/api';
export default catalogHandler('filmes', () => tmdb('trending/movie/week'));
