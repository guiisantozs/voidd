import Icon from '../Icon';
import {useSeriesWatchlist} from '../../lib/use-series-watchlist';

export default function SaveSeries({item}){
 const list=useSeriesWatchlist(item.categoria||'series'),saved=!!list.saved[item.id];
 return <><button type="button" className="vl-add-work" disabled={!list.ready||!!list.error} aria-pressed={saved} onClick={()=>list.set(item,!saved)}><Icon name={saved?'check':'plus'}/>{saved?'Na sua lista':'Quero assistir'}</button>{list.error&&<span role="status">{list.error}</span>}</>;
}
