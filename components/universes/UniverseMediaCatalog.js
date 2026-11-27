import {useEffect,useState} from 'react';
import Icon from '../Icon';
import MarvelSeriesShelves from './MarvelSeriesShelves';
import UniverseCatalogToolbar from './UniverseCatalogToolbar';
import {MovieCard,MovieFailure,PosterSkeletons} from '../movies/MovieUI';
import {UniverseProgress,useUniverseResource} from './UniverseUI';
import {sharedUniverseBySlug} from '../../lib/shared-universes';
import {filterUniverseMovies,franchiseProgress,isReviewed,orderFranchiseMovies} from '../../lib/franchise-model';
import {formatRating} from '../../lib/catalog';

export default function UniverseMediaCatalog({slug,media,onMediaChange,reviews,user,error,today='',renderCombined,children}) {
 const shared=sharedUniverseBySlug(slug),[requested,setRequested]=useState(null);
 const [order,setOrder]=useState('release'),[filter,setFilter]=useState('all');
 useEffect(()=>{if(media!=='filmes')setRequested(slug);},[media,slug]);
 useEffect(()=>{setOrder('release');setFilter('all');},[slug]);
 // Keep this public resource mounted after its first visit. Switching tabs never
 // refetches a completed catalogue, and it never caches private progress.
 const state=useUniverseResource(shared&&requested===slug?`/api/series/universos/${shared.seriesSlug}`:null);
 const data=state.data,rows=data?filterUniverseMovies(orderFranchiseMovies(data.movies,data.ordem_cronologica,order),reviews,user&&!error?filter:'all','order','series'):[];
 const seen=data?franchiseProgress(data.movies.map(item=>item.id),reviews,'series'):0;
 return <div className="u-media-catalog" id="universo-conteudos">
  <div className="u-media-tabs" role="group" aria-label="Conteúdos do universo">{[['series','Séries'],['filmes','Filmes'],['all','Ambos']].map(([value,label])=><button type="button" key={value} aria-pressed={media===value} onClick={()=>onMediaChange(value)}><Icon name={value==='series'?'monitor':value==='filmes'?'film':'globe'}/>{label}</button>)}</div>
  {media==='all'&&renderCombined?renderCombined(state):<>
  {media!=='filmes'&&<section className="u-shared-series" aria-labelledby="u-shared-series-title"><h3 id="u-shared-series-title">Séries do universo</h3>
   {!data&&state.loading?<PosterSkeletons label="Carregando séries do universo"/>:state.error?<MovieFailure message={state.error} retry={state.retry}/>:data&&<>
    {slug==='marvel-mcu'?<UniverseCatalogToolbar id="u-series-filter" filter={filter} onFilterChange={setFilter} user={user} error={error} seen={seen} total={data.total} media="series"/>:<>
    {user&&!error&&<UniverseProgress seen={seen} total={data.total} label={`Você avaliou ${seen} de ${data.total} ${data.total===1?'série':'séries'}`}/>}
    <div className="u-controls">{slug!=='marvel-mcu'&&<div className="u-order-tabs" role="group" aria-label="Ordem das séries"><button type="button" aria-pressed={order==='release'} onClick={()=>setOrder('release')}>Ordem de lançamento</button>{data.ordem_cronologica?.length>0&&<button type="button" aria-pressed={order==='chronological'} onClick={()=>setOrder('chronological')}>Ordem cronológica</button>}</div>}<div><label htmlFor="u-series-filter">Mostrar séries</label><select id="u-series-filter" value={user&&!error?filter:'all'} onChange={event=>setFilter(event.target.value)}><option value="all">Todas</option><option value="seen" disabled={!user||!!error}>Avaliadas</option><option value="unseen" disabled={!user||!!error}>Não avaliadas</option></select></div></div>
    </>}
    {slug!=='marvel-mcu'&&<p className="u-hint">{rows.length} {rows.length===1?'série':'séries'} nesta seleção. O progresso considera a avaliação da série inteira, separadamente dos filmes, temporadas e episódios.</p>}
    {data.partial&&<p className="u-hint" role="status">Parte das séries está indisponível. O progresso considera os títulos carregados. <button type="button" onClick={state.retry}>Atualizar séries</button></p>}
    {error&&<p role="status">{error}</p>}
    <>{slug==='marvel-mcu'?<MarvelSeriesShelves items={rows} today={today} reviews={reviews} user={user} error={error}/>:<div className="u-film-grid">{rows.map(item=><div className="u-film" key={`series:${item.id}`}><MovieCard movie={item}/><span className="u-order-number" aria-label={`Posição ${item.universeOrder}`}>{String(item.universeOrder).padStart(2,'0')}</span>{user&&!error&&isReviewed(reviews,item.id,'series')&&<span className="u-seen-badge"><Icon name="check"/> Avaliada · <Icon name="star"/> {formatRating(reviews[`series:${item.id}`].nota)}</span>}</div>)}</div>}</>
    {slug!=='marvel-mcu'&&!rows.length&&<p className="m-empty">Nenhuma série neste filtro. Escolha outra opção para continuar explorando.</p>}
   </>}
  </section>}
  {media!=='series'&&<div className="u-shared-films">{media==='all'&&<h3>Filmes do universo</h3>}{children}</div>}
  </>}
 </div>;
}
