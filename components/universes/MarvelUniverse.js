import UniverseArtwork from './UniverseArtwork';
import Icon from '../Icon';
import {UniverseShell,UniverseProgress} from './UniverseUI';
import PosterRow from '../movies/PosterRow';
import {MovieCard,MovieFailure} from '../movies/MovieUI';
import {franchiseProgress,isReviewed} from '../../lib/franchise-model';
import {formatRating} from '../../lib/catalog';
import {marvelUniverse} from '../../config/marvel-universe';
import {marvelShelves} from '../../lib/marvel-universe';
import MarvelUniverseHero from './MarvelUniverseHero';
import UniverseMediaCatalog from './UniverseMediaCatalog';
import MarvelCombinedCatalog from './MarvelCombinedCatalog';
import UniverseCatalogToolbar from './UniverseCatalogToolbar';

const Artwork=UniverseArtwork;
const shelves=[
  {key:'recent',id:'mais-recentes',title:'Mais recentes',icon:'sparkle',intro:'Os últimos lançamentos e os próximos capítulos do MCU.'},
  {key:'chronological',id:'ordem-cronologica',title:'Ordem cronológica',icon:'clock',intro:'Uma maratona pela linha do tempo. Histórias de outras realidades e cenas pós-créditos podem atravessar épocas diferentes.'},
  {key:'infinity',id:'saga-do-infinito',title:'Saga do Infinito',icon:'diamond',intro:'Das primeiras armaduras às Joias do Infinito. Fases 1 a 3, em ordem de lançamento.'},
  {key:'multiverse',id:'saga-do-multiverso',title:'Saga do Multiverso',icon:'globe',intro:'Novos heróis, outras realidades e destinos que se cruzam. Fases 4 a 6, em ordem de lançamento.'},
];

export default function MarvelUniverse({state,reviews,user,error,average,today,filter,setFilter,media='filmes',onMediaChange,originMedia='filmes'}) {
  const data=state.data,rows=marvelShelves(data?.movies,{today,filter:user&&!error?filter:'all',reviews});
  const seen=data?franchiseProgress(data.movies.map(movie=>movie.id),reviews):0;
  function renderCard(movie,numbered=false) {
    const upcoming=!movie.estreia||!today||movie.estreia>today;
    return <div className="mu-movie" key={movie.id}><MovieCard movie={movie} upcoming={upcoming} now={today?new Date(`${today}T12:00:00-03:00`):undefined}/>
      {numbered&&<span className="mu-order" aria-label={`Posição ${marvelUniverse.chronology.indexOf(movie.id)+1}`}>{String(marvelUniverse.chronology.indexOf(movie.id)+1).padStart(2,'0')}</span>}
      {user&&isReviewed(reviews,movie.id)&&<span className="mu-seen"><Icon name="check"/>Visto · {formatRating(reviews[`filmes:${movie.id}`].nota)} / 5</span>}
    </div>;
  }
  return <UniverseShell title="Universo Marvel" className="marvel-universe" media={originMedia}><main>
    <MarvelUniverseHero media={originMedia}/>
    <section className="mu-about" aria-labelledby="mu-about-title"><div className="mu-about-art" aria-hidden="true"><Artwork src={marvelUniverse.about} fill quality={100} sizes="(max-width:760px) 100vw, 72vw" alt=""/></div><div className="m-container"><div className="mu-about-copy"><p className="m-eyebrow">UM UNIVERSO. INFINITAS HISTÓRIAS.</p><h2 id="mu-about-title">Cada herói deixa<br/>a sua <em>marca.</em></h2><p>Das primeiras alianças às fronteiras do multiverso, reencontre as histórias que transformaram encontros em grandes sagas.</p><p>Escolha um ponto de partida, siga a linha do tempo ou reviva uma saga inteira. A próxima história começa com você.</p>
      <div className="mu-facts"><div><strong>{data?.total??'—'}</strong><span>filmes no universo</span></div><div><strong>{average.loading?'—':average.rating==null?'—':formatRating(average.rating)}<small> / 5</small></strong><span>na comunidade VOID</span></div></div>
      {user&&data&&<UniverseProgress seen={seen} total={data.total}/>}
      {average.error&&<p className="mu-note">Nota da comunidade indisponível no momento.</p>}
    </div></div></section>
    <div className="m-container mu-catalog"><div className="mu-catalog-heading"><div><p className="m-eyebrow">ESCOLHA SUA PRÓXIMA HISTÓRIA</p><h2>Explore o universo Marvel</h2></div></div>
      <UniverseMediaCatalog today={today} slug="marvel-mcu" media={media} onMediaChange={onMediaChange} reviews={reviews} user={user} error={error} renderCombined={seriesState=><MarvelCombinedCatalog filmState={state} seriesState={seriesState} today={today} reviews={reviews} user={user} error={error}/>}>
      <h3 className="u-catalog-title">Filmes do universo</h3>
      <UniverseCatalogToolbar id="mu-filter" filter={filter} onFilterChange={setFilter} user={user} error={error} seen={seen} total={data?.total??0} media="filmes"/>
      <nav className="mu-shelf-links" aria-label="Seleções do universo Marvel">{shelves.map(shelf=><a key={shelf.key} href={'#'+shelf.id}>{shelf.title}<Icon name="arrow-right" className="mu-down"/></a>)}</nav>
      {data?.partial&&<p className="mu-note" role="status">Parte do catálogo está indisponível. <button type="button" onClick={state.retry}>Atualizar seleção</button></p>}{error&&<p className="mu-note" role="status">{error}</p>}
      {state.error?<MovieFailure message={state.error} retry={state.retry}/>:shelves.map(shelf=><div className="mu-shelf" id={shelf.id} key={shelf.key}><PosterRow title={shelf.title} icon={shelf.icon} sectionKey={'marvel-'+shelf.key} state={{loading:state.loading,movies:rows[shelf.key]}} intro={<p className="mu-shelf-intro">{shelf.intro}</p>} renderCard={movie=>renderCard(movie,shelf.key==='chronological'&&marvelUniverse.chronology.includes(movie.id))} empty={<div className="mu-empty"><Icon name="film"/><p>{user&&filter!=='all'?'Nenhum filme com este filtro nesta seleção.':'Ainda não há filmes disponíveis nesta seleção.'}</p>{filter!=='all'&&<button className="m-button m-button-outline" type="button" onClick={()=>setFilter('all')}>Mostrar todos</button>}</div>}/></div>)}
      </UniverseMediaCatalog>
    </div>
  </main></UniverseShell>;
}
