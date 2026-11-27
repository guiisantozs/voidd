import MovieReviewsFeed from './MovieReviewsFeed';
import GameReviewsFeed from './GameReviewsFeed';
import SeriesReviewsFeed from './SeriesReviewsFeed';
import { REVIEW_FEED_MEDIA } from '../../lib/reviews-feed';

// Preserve the movie adapter's search and pagination while other media opt
// into the cursor RPC, with a single media-configured feed entry point.
const adapters = { movie: MovieReviewsFeed, game: GameReviewsFeed, series: SeriesReviewsFeed, anime: SeriesReviewsFeed };
export default function ReviewsFeed({ mediaType = 'movie' }) {
  const Feed = adapters[mediaType], media = REVIEW_FEED_MEDIA[mediaType];
  if (!Feed || !media) throw Error('Unsupported review feed media');
  return <Feed media={media}/>;
}
