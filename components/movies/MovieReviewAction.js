import Link from 'next/link';
import Icon from '../Icon';
import {useMovieRelease} from '../../lib/use-movie-release';
import {movieReviewHref} from '../../lib/movie-sections';

export default function MovieReviewAction({movie,className='',children,onClick}){
 const release=useMovieRelease(movie);
 return release.allowed?<Link className={className} href={movieReviewHref(movie)} onClick={onClick}>{children||<>Avaliar <Icon name="arrow-up-right"/></>}</Link>:<span className={`${className} m-review-unavailable`} title={release.message}>Avaliação após a estreia</span>;
}
