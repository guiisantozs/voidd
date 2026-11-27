import {useRouter} from 'next/router';
import {useAccount} from '../../../components/AccountProvider';
import MovieHeader from '../../../components/movies/MovieHeader';
import {ListContent,WatchLater} from '../../listas/[id]';
import {useSeriesStandardList} from '../../../components/lists/SeriesWatchlistCard';

function SeriesWatchLater(){const {watchlist}=useSeriesStandardList();return <WatchLater watchlist={watchlist} media="series" basePath="/series/listas"/>;}
export default function SeriesListPage(){
 const router=useRouter(),{user}=useAccount();
 return <div className="movies-page lists-page"><MovieHeader current="listas" seriesOnly/>{router.isReady&&(router.query.id==='quero-assistir'?<SeriesWatchLater key={user?.id||'guest'}/>:<ListContent key={`${user?.id||'guest'}:${router.query.id}`} id={router.query.id} basePath="/series/listas"/>)}</div>;
}
