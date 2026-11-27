import {useRouter} from 'next/router';
import {useAccount} from '../../../components/AccountProvider';
import MovieHeader from '../../../components/movies/MovieHeader';
import {ListContent,WatchLater} from '../../listas/[id]';
import {useSeriesStandardList} from '../../../components/lists/SeriesWatchlistCard';
function AnimeWatchLater(){const {watchlist}=useSeriesStandardList('animes');return <WatchLater watchlist={watchlist} media="animes" basePath="/animes/listas"/>;}
export default function AnimeListPage(){const router=useRouter(),{user}=useAccount();return <div className="movies-page lists-page"><MovieHeader current="listas" media="animes" seriesOnly/>{router.isReady&&(router.query.id==='quero-assistir'?<AnimeWatchLater key={user?.id||'guest'}/>:<ListContent key={user?.id+':'+router.query.id} id={router.query.id} basePath="/animes/listas"/>)}</div>;}
