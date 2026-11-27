import MovieHeader from '../movies/MovieHeader';
import Icon from '../Icon';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect,useState } from 'react';
import { useAccount } from '../AccountProvider';
import { DATA_EVENT } from '../../lib/account-storage';
import { readReviews } from '../../lib/catalog';
import { weightedVoidRating } from '../../lib/franchise-model';
import { MovieListProvider } from '../movies/MovieUI';

export function UniverseShell({title,children,className='',media='filmes'}){
  return <div className={`movies-page universes-page ${className}`}><MovieListProvider><Head><title>{title} — VOID</title></Head><MovieHeader current="universos" seriesOnly={['series','animes'].includes(media)} media={media}/>{children}<footer className="m-footer m-container"><div><Link className="logo" href="/">void<span><Icon name="dot" /></span></Link><p>Cada história faz parte de algo maior.</p></div><div><Link href={`/${media}`}>{media==='animes'?'Animes':media==='series'?'Séries':'Filmes'}</Link><Link href={media==='animes'?'/animes/universos':media==='series'?'/series/universos':'/universos'}>Universos</Link></div><div className="m-tmdb">{media==='animes'?<a href="https://jikan.lucashdo.com/" target="_blank" rel="noopener noreferrer">Dados de MyAnimeList via Jikan-Edge</a>:<><a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">Dados fornecidos por TMDB</a><p>Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.</p></>}</div></footer></MovieListProvider></div>;
}
export function useUniverseResource(url){
  const [state,setState]=useState({});const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    if(!url)return;
    const controller=new AbortController();setState(old=>({... (old.key===url?old:{}),key:url,loading:true,error:''}));
    fetch(url,{signal:controller.signal,cache:attempt?'reload':'default'}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.erro||'Não foi possível carregar os universos.');if(!controller.signal.aborted)setState({key:url,data,loading:false});}).catch(error=>{if(!controller.signal.aborted)setState({key:url,error:error.message,loading:false});});
    return ()=>controller.abort();
  },[url,attempt]);
  return {...(state.key===url?state:{loading:true}),retry:()=>setAttempt(value=>value+1)};
}
export function useUniverseReviews(){
  const {user}=useAccount();const [state,setState]=useState({reviews:{},error:''});
  useEffect(()=>{
    function refresh(){try{setState({reviews:user?readReviews():{},error:''});}catch{setState({reviews:{},error:'Não foi possível ler seu progresso. Atualize sua conta para sincronizar novamente.'});}}
    refresh();window.addEventListener('storage',refresh);window.addEventListener(DATA_EVENT,refresh);
    return ()=>{window.removeEventListener('storage',refresh);window.removeEventListener(DATA_EVENT,refresh);};
  },[user?.id]);
  return {...state,user};
}
export function UniverseProgress({seen,total,label,description='Progresso baseado nas suas avaliações'}){
  return <div className="u-progress"><span>{label||`Você viu ${seen} de ${total}`}</span><div role="progressbar" aria-label={description} aria-valuenow={seen} aria-valuemin={0} aria-valuemax={total||1}><span style={{width:`${total?seen/total*100:0}%`}} /></div></div>;
}
export function UniverseSkeleton(){return <div className="u-skeleton-grid" role="status" aria-label="Carregando universos">{Array.from({length:6},(_,i)=><div key={i} className="m-skeleton" />)}</div>;}

// Only public aggregates use Supabase here. Progress comes from the existing, owner-scoped account cache.
export function useUniverseAverage(movies){
  const {client}=useAccount();const [state,setState]=useState({loading:true});
  const key=movies?.map(movie=>`filmes:${movie.id}`).sort().join(',')||'';
  useEffect(()=>{
    if(!key)return;let active=true;const ids=key.split(',');setState({key,loading:true});
    async function load(){
      try{
        if(!client)throw Error('CONFIG');const rows=[];
        for(let start=0;start<ids.length;start+=80){const {data,error}=await client.from('void_movie_stats').select('item_key,average,total').in('item_key',ids.slice(start,start+80));if(error)throw error;rows.push(...data);}
        if(active)setState({key,rating:weightedVoidRating(rows),loading:false});
      }catch{if(active)setState({key,loading:false,error:true});}
    }
    load();return ()=>{active=false;};
  },[client,key]);
  return !key?{loading:false,rating:null}:state.key===key?state:{loading:true};
}
