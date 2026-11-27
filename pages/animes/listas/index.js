import Lists from '../../listas';
import {useSeriesStandardList} from '../../../components/lists/SeriesWatchlistCard';
export default function AnimeLists(){const {standard}=useSeriesStandardList('animes');return <Lists fixedMedia="animes" basePath="/animes/listas" standard={standard}/>;}
