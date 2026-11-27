import Lists from '../../listas';
import {useSeriesStandardList} from '../../../components/lists/SeriesWatchlistCard';

export default function SeriesLists(){
 const {standard}=useSeriesStandardList();
 return <Lists fixedMedia="series" basePath="/series/listas" standard={standard}/>;
}
