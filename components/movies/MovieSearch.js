import Icon from '../Icon';
import { useEffect,useState } from 'react';
import { movieGenres } from '../../lib/movie-search-options';
import {seriesGenreNames} from '../../config/series';
import {animeGenreNames} from '../../config/animes';
import { MovieCard,MovieFailure,PosterSkeletons } from './MovieUI';
import {publicCatalog,SEARCH_DELAY_MS,shortSearch} from '../../lib/public-catalog-client.js';

export default function MovieSearch({media='filmes'}) {
  const anime=media==='animes',series=media==='series'||anime,plural=anime?'animes':series?'séries':'filmes',singular=anime?'anime':series?'série':'filme',prefix=series?media:'movie',genres=anime?Object.entries(animeGenreNames):series?Object.entries(seriesGenreNames):movieGenres;
  const [query,setQuery]=useState('');const [genre,setGenre]=useState('all');const [year,setYear]=useState('');
  const [history,setHistory]=useState(['1:0']);const [attempt,setAttempt]=useState(0);const [state,setState]=useState({});
  const active=!!(query.trim() || genre!=='all' || year);
  const cursor=history[history.length-1];const key=JSON.stringify([query.trim(),genre,year,cursor,attempt]);
  const loading=active && (state.key!==key || state.loading);
  function change(setter,value) { setter(value);setHistory(['1:0']); }
  function clear() { setQuery('');setGenre('all');setYear('');setHistory(['1:0']); }
  useEffect(()=>{
    if(!active) return;
    if(shortSearch(query)){setState({key,error:'Digite pelo menos duas letras para buscar por título.'});return;}
    if(year && (!/^\d{4}$/.test(year) || +year<1874 || +year>2099)) { setState({key,error:'Informe um ano entre 1874 e 2099.'});return; }
    const controller=new AbortController();
    const timer=setTimeout(async()=>{
      setState({key,loading:true});
      try {
        const params=new URLSearchParams({q:query.trim(),genre,year,cursor});
        const data=await publicCatalog.request(`${series?`/api/${media}/search`:'/api/movie-search'}?${params}`,{signal:controller.signal});
        if(!controller.signal.aborted) setState({...data,key,loading:false});
      } catch(error) { if(!controller.signal.aborted) setState({key,error:error.message}); }
    },SEARCH_DELAY_MS);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[key,active]);
  return <section className="m-search m-container" id={`buscar-${media}`} aria-labelledby={`${prefix}-search-heading`}><div className="m-section-title"><span aria-hidden="true"><Icon name="search" /></span><h2 id={`${prefix}-search-heading`}>{anime?'Encontre seu próximo anime':series?"Encontre sua próxima série":"Encontre seu próximo filme"}</h2><span className="m-section-line" /></div>
    <form className="m-search-controls" onSubmit={event=>{event.preventDefault();setAttempt(value=>value+1);}}>
      <div><label htmlFor={`${prefix}-query`}>Título {anime?'do anime':series?"da série":"do filme"}</label><input id={`${prefix}-query`} type="search" maxLength={100} value={query} onChange={event=>change(setQuery,event.target.value)} placeholder="Busque por título…" /></div>
      <div><label htmlFor={`${prefix}-genre`}>Gênero</label><select id={`${prefix}-genre`} value={genre} onChange={event=>change(setGenre,event.target.value)}><option value="all">Todos os gêneros</option>{genres.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></div>
      <div><label htmlFor={`${prefix}-year`}>Ano</label><input id={`${prefix}-year`} type="number" min="1874" max="2099" step="1" value={year} onChange={event=>change(setYear,event.target.value)} placeholder="Todos" /></div>
      <button type="submit">Buscar</button>{active && <button type="button" className="m-search-clear" onClick={clear}>Limpar</button>}
    </form>
    {active && <div className="m-search-results" aria-busy={loading}><p role="status" aria-live="polite">{loading?`Buscando ${plural}…`:state.error?'':`${state.movies?.length || 0} ${plural} nesta página${query.trim()?` para “${query.trim()}”`:''}.`}</p>{loading?<PosterSkeletons label={`Carregando ${plural}`}/>:state.error?<MovieFailure message={state.error} retry={()=>setAttempt(value=>value+1)} />:state.movies?.length?<div className="m-search-grid">{state.movies.map(movie=><MovieCard key={movie.id} movie={movie} />)}</div>:<p className="m-empty">{state.next?`Nenhum título deste gênero nesta etapa. Continue na próxima página para pesquisar mais ${plural}.`:`Nenhuma ${singular} encontrada. Tente outro título ou ajuste os filtros.`}</p>}
    {!loading && !state.error && <nav className="m-search-pagination" aria-label="Páginas da busca"><button type="button" disabled={history.length===1} onClick={()=>setHistory(old=>old.slice(0,-1))}><Icon name="arrow-left" />{" Anterior"}</button><span>Página {history.length}</span><button type="button" disabled={!state.next} onClick={()=>setHistory(old=>[...old,state.next])}>{"Próxima "}<Icon name="arrow-right" /></button></nav>}</div>}
  </section>;
}
