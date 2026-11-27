import {useCallback,useEffect,useRef,useState} from 'react';
import {useAccount} from '../components/AccountProvider';
import {LISTS_EVENT} from './lists';
export const defaultWatchlist={title:'Ver depois',description:'Os filmes que você guardou para a próxima sessão.',visibility:'private',media_types:['filmes'],source_key:'watchlist'};
export const defaultSeriesWatchlist={title:'Quero assistir',description:'As séries que você guardou para a próxima maratona.',visibility:'private',media_types:['series'],source_key:'series_watchlist'};
export const defaultAnimeWatchlist={title:'Quero assistir',description:'Os animes que você guardou para a próxima maratona.',visibility:'private',media_types:['animes'],source_key:'anime_watchlist'};
export function useWatchlistSettings(media='filmes'){
 const defaults=media==='animes'?defaultAnimeWatchlist:media==='series'?defaultSeriesWatchlist:defaultWatchlist,source=defaults.source_key;
 const {client,user,ready}=useAccount(),[state,setState]=useState({}),generation=useRef(0);
 const load=useCallback(()=>{
  const token=++generation.current;if(!ready||!client||!user){setState({owner:user?.id});return;}
  setState(old=>({...(old.owner===user.id?old:{}),owner:user.id,loading:true,error:false}));
  client.from('lists').select('id,title,description,visibility,media_types,updated_at,source_key').eq('owner_id',user.id).eq('source_key',source).maybeSingle().then(({data,error})=>{if(token===generation.current)setState({owner:user.id,data,error:!!error});}).catch(()=>{if(token===generation.current)setState({owner:user.id,error:true});});
 },[client,user?.id,ready,source]);
 useEffect(()=>{load();window.addEventListener(LISTS_EVENT,load);window.addEventListener('focus',load);return()=>{generation.current++;window.removeEventListener(LISTS_EVENT,load);window.removeEventListener('focus',load);};},[load]);
 const visible=state.owner===user?.id?state:{};
 return {...visible,settings:{...defaults,...visible.data},refresh:load};
}
