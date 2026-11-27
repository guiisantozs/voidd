import {useEffect,useState} from 'react';
import {useAccount} from '../components/AccountProvider';
import {DATA_EVENT,scopedStorage} from './account-storage';
import {readWatchlist,setWatchlistItem} from './movie-watchlist';

export function useSeriesWatchlist(media='series'){
 const {user}=useAccount(),owner=user?.id||null,[state,setState]=useState({});
 useEffect(()=>{
  function refresh(){try{setState({owner,media,saved:readWatchlist(scopedStorage(localStorage,owner),media),ready:true});}catch{setState({owner,media,saved:{},ready:true,error:'Não foi possível ler sua lista. Seus dados foram preservados.'});}}
  refresh();window.addEventListener(DATA_EVENT,refresh);window.addEventListener('storage',refresh);
  return()=>{window.removeEventListener(DATA_EVENT,refresh);window.removeEventListener('storage',refresh);};
 },[owner,media]);
 const visible=state.owner===owner&&state.media===media?state:{};
 function set(item,present){try{if(item.categoria!==media)throw Error();const saved=setWatchlistItem(scopedStorage(localStorage,owner),item,present);setState({owner,media,saved,ready:true});if(!owner)window.dispatchEvent(new Event(DATA_EVENT));return true;}catch{setState(old=>({...old,owner,media,error:'Não foi possível salvar. Confira o armazenamento do navegador.'}));return false;}}
 return {...visible,saved:visible.saved||{},set};
}
