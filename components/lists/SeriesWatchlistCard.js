import {useAccount} from '../AccountProvider';
import {useSeriesWatchlist} from '../../lib/use-series-watchlist';
import {useWatchlistSettings} from '../../lib/use-watchlist-settings';
import {ListCard} from './ListUI';

export function useSeriesStandardList(media='series'){
 const {user}=useAccount(),watchlist=useSeriesWatchlist(media),watchlistSettings=useWatchlistSettings(media);
 const items=Object.values(watchlist.saved);
 return {watchlist:{...watchlist,watchlistSettings},standard:{...watchlistSettings.settings,id:'quero-assistir',special:true,owner_id:user?.id,item_count:items.length,cover:items.slice(0,5)}};
}
export default function SeriesWatchlistCard({media='series'}){const {standard}=useSeriesStandardList(media);return <ListCard list={standard} basePath={`/${media}/listas`}/>;}
