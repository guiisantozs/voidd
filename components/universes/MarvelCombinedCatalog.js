import {useState} from 'react';
import Icon from '../Icon';
import PosterRow from '../movies/PosterRow';
import {MovieCard,MovieFailure} from '../movies/MovieUI';
import UniverseCatalogToolbar from './UniverseCatalogToolbar';
import {isReviewed} from '../../lib/franchise-model';
import {formatRating} from '../../lib/catalog';
import {marvelCombinedShelves} from '../../lib/marvel-universe';

const shelves=[
  {key:'chronological',title:'Ordem cronológica',icon:'clock',intro:'Filmes e séries na mesma linha do tempo, considerando o início de cada série. Temporadas posteriores e realidades paralelas podem atravessar outras épocas. Obras sem posição definida ficam ao final.'},
  {key:'recent',title:'Mais recentes',icon:'sparkle',intro:'Filmes e séries por estreia, dos mais recentes aos mais antigos, seguidos dos próximos lançamentos.'},
  {key:'all',title:'Todos os filmes e séries',icon:'film',intro:'Toda a seleção do universo Marvel, reunida em ordem de lançamento.'},
  {key:'multiverse',title:'Saga do Multiverso',icon:'globe',intro:'Filmes e séries das Fases 4 a 6, juntos em ordem de lançamento.'},
];

export default function MarvelCombinedCatalog({filmState,seriesState,today,reviews,user,error}) {
  const [filter,setFilter]=useState('all');
  const allowed=!!user&&!error;
  const rows=marvelCombinedShelves(filmState.data?.movies,seriesState.data?.movies,{today,filter:allowed?filter:'all',reviews});
  const all=marvelCombinedShelves(filmState.data?.movies,seriesState.data?.movies).all;
  const seen=all.filter(item=>isReviewed(reviews,item.id,item.categoria)).length;
  const loading=(!filmState.data&&!filmState.error)||(!seriesState.data&&!seriesState.error);
  return <section className="u-shared-combined" aria-labelledby="mu-combined-title">
    <h3 id="mu-combined-title">Filmes e séries do universo</h3>
    <UniverseCatalogToolbar id="mu-combined-filter" filter={filter} onFilterChange={setFilter} user={user} error={error} seen={seen} total={all.length}/>
    {[[filmState,'filmes'],[seriesState,'séries']].map(([state,label])=><div key={label}>{state.error&&<MovieFailure message={`Não foi possível carregar ${label}. ${state.error}`} retry={state.retry}/>} {state.data?.partial&&<p className="mu-note" role="status">Parte do catálogo de {label} está indisponível. <button type="button" onClick={state.retry}>Atualizar {label}</button></p>}</div>)}
    {error&&<p className="mu-note" role="status">{error}</p>}
    <nav className="mu-shelf-links" aria-label="Seleções de filmes e séries da Marvel">{shelves.map(shelf=><a key={shelf.key} href={`#marvel-both-${shelf.key}`}>{shelf.title}<Icon name="arrow-right" className="mu-down"/></a>)}</nav>
    {shelves.map(shelf=><div className="mu-shelf" id={`marvel-both-${shelf.key}`} key={shelf.key}><PosterRow title={shelf.title} icon={shelf.icon} sectionKey={`marvel-both-${shelf.key}`} state={{loading,movies:rows[shelf.key]}} intro={<p className="mu-shelf-intro">{shelf.intro}</p>}
      renderCard={item=><div className="mu-movie" key={`${item.categoria}:${item.id}`}><span className="mu-media-label">{item.categoria==='series'?'Série':'Filme'}</span><MovieCard movie={item} upcoming={!item.estreia||!today||item.estreia>today} now={today?new Date(`${today}T12:00:00-03:00`):undefined}/>
        {shelf.key==='chronological'&&item.chronologyKnown&&<span className="mu-order" aria-label={`Posição ${item.universeOrder}`}>{String(item.universeOrder).padStart(2,'0')}</span>}
        {shelf.key==='chronological'&&!item.chronologyKnown&&<span className="mu-media-label">Sem posição definida</span>}
        {allowed&&isReviewed(reviews,item.id,item.categoria)&&<span className="mu-seen"><Icon name="check"/>Avaliado · {formatRating(reviews[`${item.categoria}:${item.id}`].nota)} / 5</span>}
      </div>} empty={<p className="m-empty">Nenhum conteúdo disponível nesta seleção com o filtro atual.</p>}/></div>)}
  </section>;
}
