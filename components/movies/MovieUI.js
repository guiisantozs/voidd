import {animeDisplayTitle} from '../../lib/anime-titles';
import MovieReviewAction from './MovieReviewAction';
import AddToList from '../lists/AddToList';
import {ListPickerDialog} from '../lists/ListPicker';
import {useAccount} from '../AccountProvider';
import {movieSaveDestination} from '../../lib/movie-save-destination';
import { useWatchlistSettings } from '../../lib/use-watchlist-settings';
import Icon from '../Icon';
import Link from 'next/link';
import Image from '../animes/AnimeImage';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { DATA_EVENT, scopedStorage } from '../../lib/account-storage';
import { readMovieList, toggleMovie } from '../../lib/movie-watchlist';
import { movieHref, releaseLabel, daysUntilRelease } from '../../lib/movie-sections';
import { formatRating } from '../../lib/catalog';
import {animeHeroEligible} from '../../lib/anime-artwork-policy';

const Watchlist = createContext(null);
export const useMovieList = () => useContext(Watchlist);
export function MovieListProvider({ children }) {
  const [saved, setSaved] = useState({});
  const watchlistSettings=useWatchlistSettings();
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 5000);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    function refresh() {
      try { setSaved(readMovieList(scopedStorage(localStorage))); }
      catch { setMessage('Não foi possível ler sua lista neste navegador.'); }
      setReady(true);
    }
    refresh();
    window.addEventListener('storage', refresh); window.addEventListener(DATA_EVENT, refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener(DATA_EVENT, refresh); };
  }, []);
  function toggle(movie) {
    try {
      const data = toggleMovie(scopedStorage(localStorage), movie);
      setSaved(data); setMessage(data[movie.id] ? `${movie.titulo} adicionado à sua lista.` : `${movie.titulo} removido da sua lista.`);
    } catch { setMessage('Não foi possível salvar sua lista. Tente novamente.'); }
  }
  return <Watchlist.Provider value={{ saved, ready, toggle,watchlistSettings }}>{children}<p className="m-list-feedback" role="status">{message}</p></Watchlist.Provider>;
}
export function SaveMovie(props) {
  return props.movie.categoria&&props.movie.categoria!=='filmes'?<AddToList item={props.movie} label="Adicionar à lista"/>:<SaveFilm {...props}/>;
}
function SaveFilm({ movie, upcoming = false, direct = false }) {
  const watchlist=useContext(Watchlist),{saved,ready,toggle}=watchlist,{client,user}=useAccount();
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false),controller=useRef(null);
  const scope=`${user?.id||'guest'}:${movie.id}`,current=useRef(scope);current.current=scope;
  useEffect(()=>{current.current=scope;setOpen(false);setError('');setBusy(false);lock.current=false;return()=>{current.current=null;controller.current?.abort();};},[scope]);
  async function save(event){
    event.preventDefault();event.stopPropagation();if(lock.current||!ready)return;
    if(direct||!user){toggle(movie);return;}
    const owner=current.current;lock.current=true;setBusy(true);setError('');controller.current=new AbortController();
    try{const destination=await movieSaveDestination(client,user.id,controller.current.signal);if(current.current!==owner)return;if(destination==='picker')setOpen(true);else toggle(movie);}
    catch{if(current.current===owner)setError('Não foi possível carregar suas listas. Clique no + para tentar novamente.');}
    finally{if(current.current===owner){lock.current=false;setBusy(false);}}
  }
  return <><button className="m-save" type="button" disabled={!ready} aria-busy={busy} aria-pressed={direct||!user?!!saved[movie.id]:undefined} aria-haspopup={!direct&&user?'dialog':undefined} aria-expanded={!direct&&user?open:undefined} aria-label={!direct&&user?`Salvar ${movie.titulo} em uma lista`:`${saved[movie.id]?'Remover':'Adicionar'} ${movie.titulo} ${saved[movie.id]?'da':'à'} lista Ver depois`} title="Salvar em suas listas" onClick={save}><span className="m-save-mark" aria-hidden="true">{busy?<Icon name="clock"/>:saved[movie.id]?<Icon name="check"/>:<Icon name="plus"/>}</span>{' '}<span className="m-save-label">{saved[movie.id]?'Na sua lista':upcoming?'Quero ver':'Ver depois'}</span></button>{error&&<span className="m-save-error" role="status">{error}</span>}{open&&<ListPickerDialog item={movie} watchlist={watchlist} onClose={()=>setOpen(false)}/>}</>;
}
export function rememberMovie(movie) {
  try { sessionStorage.setItem(`void:item:${movie.categoria||'filmes'}:${movie.id}`, JSON.stringify(movie)); } catch { /* Detalhes também podem ser consultados por ID. */ }
}
export function MovieImage({ movie, backdrop = false, eager = false, className = '', priority = eager, onLoad, onError }) {
  const [failed, setFailed] = useState(false);
  const [fallback,setFallback]=useState(false);
  const guarded=backdrop&&movie.categoria==='animes'&&Number(movie.id)>9000000000;
  const primary=backdrop?guarded&&!animeHeroEligible(movie)?null:movie.backdrop:movie.poster;
  const alternative=backdrop?guarded?null:movie.backdropFallback:movie.posterFallback;
  const path = fallback?null:backdrop ? movie.backdropPath : movie.posterPath;
  const src = fallback?alternative:primary;
  const ImageComponent=movie.categoria==='animes'?Image:'img',optimized=movie.categoria==='animes';
  useEffect(() => { setFailed(false);setFallback(false); }, [primary,alternative]);
  const srcSet = path ? backdrop
    ? `https://image.tmdb.org/t/p/w780${path} 780w, https://image.tmdb.org/t/p/w1280${path} 1280w${guarded&&movie.backdropWidth>=1920?`, https://image.tmdb.org/t/p/original${path} ${movie.backdropWidth}w`:''}`
    : `https://image.tmdb.org/t/p/w185${path} 185w, https://image.tmdb.org/t/p/w342${path} 342w, https://image.tmdb.org/t/p/w500${path} 500w${movie.categoria==='animes'&&movie.posterWidth>=600?`, https://image.tmdb.org/t/p/original${path} ${movie.posterWidth}w`:` , https://image.tmdb.org/t/p/w780${path} 780w`}` : undefined;
  return src && !failed ? <ImageComponent {...(optimized?{width:backdrop?1920:780,height:backdrop?1080:1170,quality:85}:{})} className={className} src={src} srcSet={optimized?undefined:srcSet} sizes={backdrop ? '100vw' : '(max-width: 600px) 42vw, (max-width: 1000px) 25vw, 210px'} alt={`${backdrop ? 'Cena' : 'Pôster'} de ${movie.titulo}`} loading={eager ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : eager ? 'low' : undefined} decoding="async" onLoad={onLoad} onError={event => { if(!fallback&&alternative&&alternative!==src){setFallback(true);return;}setFailed(true); onError?.(event); }} />
    : <div className={`m-missing-image ${className}`} role="img" aria-label={`Imagem indisponível de ${movie.titulo}`}><span>void.</span></div>;
}
export function MovieCard({ movie, upcoming = false, now }) {
  const displayTitle=movie.categoria==='animes'?animeDisplayTitle(movie):movie.titulo;
  const days = upcoming ? daysUntilRelease(movie.estreia, now) : null;
  const score=Number.isFinite(movie.nota)?<><Icon name="star"/> {movie.externalRatingSource||'TMDB'} {formatRating(movie.nota)} / 5</>:null;
  return <article className={`m-card ${upcoming ? 'm-card-upcoming' : ''}`}><div className="m-poster-wrap"><Link href={movieHref(movie)} onClick={() => rememberMovie(movie)} className="m-poster-link" aria-label={`Ver detalhes de ${displayTitle}`}><MovieImage movie={movie} />{movie.friend && <span className="m-friend-badge"><span className="m-avatar" aria-label={`Avatar de ${movie.friend.name}`}>{movie.friend.name.slice(0, 1).toUpperCase()}</span><span>{movie.friend.name}{movie.friend.username&&<small className="void-person-handle">@{movie.friend.username}</small>}<br /><Icon name="star" />{" "}{formatRating(Number(movie.friend.rating))}/5</span></span>}<span className="m-poster-hover-title">{displayTitle}</span></Link><div className="m-card-overlay"><Link href={movieHref(movie)} onClick={() => rememberMovie(movie)}><h3>{displayTitle}</h3></Link><p>{movie.ano || 'Ano não informado'}{score&&<span>{score}</span>}</p><div className="m-card-actions"><SaveMovie movie={movie} /><MovieReviewAction movie={movie} onClick={()=>rememberMovie(movie)}/></div></div></div><div className="m-card-caption"><Link href={movieHref(movie)} onClick={() => rememberMovie(movie)}>{displayTitle}</Link>{upcoming ? <><time dateTime={movie.estreia || undefined}>{releaseLabel(movie.estreia)}</time><p>{days === null ? 'Estreia a confirmar' : days > 0 ? `Faltam ${days} ${days === 1 ? 'dia' : 'dias'}` : days === 0 ? 'Estreia hoje' : 'Data de estreia já passou'}</p><SaveMovie movie={movie} upcoming /></> : <span>{movie.voidNote || <>{movie.ano || 'Ano não informado'}{score&&<> · {score}</>}</>}</span>}{movie.recommendationReason&&<small className="m-recommendation-reason">{movie.recommendationReason}</small>}</div></article>;
}
export function MovieFailure({ message, retry }) {
  return <div className="m-section-error" role="status"><p>{message || 'Esta seleção não está disponível agora.'}</p><button type="button" onClick={retry}>{"Tentar novamente "}<Icon name="refresh" /></button></div>;
}
export function PosterSkeletons({ count = 6, label = 'Carregando filmes' }) {
  return <div className="m-poster-skeletons" role="status" aria-label={label}>{Array.from({ length: count }, (_, i) => <div className="m-skeleton-poster" key={i}><div className="m-skeleton" /><span className="m-skeleton" /></div>)}</div>;
}
