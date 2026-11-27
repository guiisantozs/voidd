import Icon from '../../components/Icon';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect,useState } from 'react';
import { UniverseShell,UniverseProgress,useUniverseAverage,useUniverseResource,useUniverseReviews } from '../../components/universes/UniverseUI';
import { MovieCard,MovieFailure,PosterSkeletons } from '../../components/movies/MovieUI';
import { franchiseBySlug } from '../../franchises.config';
import { filterUniverseMovies,franchiseProgress,isReviewed,orderFranchiseMovies } from '../../lib/franchise-model';
import { brazilDay,releaseLabel } from '../../lib/movie-sections';
import { formatRating } from '../../lib/catalog';
import MarvelUniverse from '../../components/universes/MarvelUniverse';
import StarWarsUniverse from '../../components/universes/StarWarsUniverse';
import HarryPotterUniverse from '../../components/universes/HarryPotterUniverse';
import DCUniverse from '../../components/universes/DCUniverse';
import CinematicMovieUniverse from '../../components/universes/CinematicMovieUniverse';
import {movieUniverseLandings} from '../../config/movie-universe-landings';
import {movieUniverseSrcSet} from '../../lib/universe-backdrop';
import {sharedUniverseBySlug,universeMedia,universeMediaQuery} from '../../lib/shared-universes';
import UniverseMediaCatalog from '../../components/universes/UniverseMediaCatalog';

export default function Universe(){
  const router=useRouter();const slug=typeof router.query.slug==='string'?router.query.slug:null;
  const shared=sharedUniverseBySlug(slug),media=universeMedia(router.query.media),originMedia=shared&&router.query.from==='series'?'series':'filmes';
  const changeMedia=value=>router.push({pathname:router.pathname,query:universeMediaQuery(router.query,value)},undefined,{shallow:true,scroll:false});
  const state=useUniverseResource(slug?`/api/universos/${encodeURIComponent(slug)}`:null);const {reviews,user,error}=useUniverseReviews();
  const average=useUniverseAverage(state.data?.movies);const [mode,setMode]=useState('release');const [filter,setFilter]=useState('all');const [sort,setSort]=useState('order');const [limit,setLimit]=useState(24);const [today,setToday]=useState('');
  useEffect(()=>{setMode('release');setFilter('all');setSort('order');},[slug]);
  useEffect(()=>{setLimit(24);},[slug,mode,filter,sort]);
  useEffect(()=>{setToday(brazilDay(new Date()));const timer=setInterval(()=>setToday(brazilDay(new Date())),60000);return ()=>clearInterval(timer);},[]);
  const landing=movieUniverseLandings[slug];
  const data=state.data;const ordered=data?orderFranchiseMovies(data.movies,data.ordem_cronologica,mode):[];
  const rows=filterUniverseMovies(ordered,reviews,user?filter:'all',sort);
  const filmCatalog=data?<><div className="u-controls"><div className="u-order-tabs" aria-label="Ordem dos filmes"><button type="button" aria-pressed={mode==='release'} onClick={()=>setMode('release')}>Ordem de lançamento</button>{data.ordem_cronologica.length>0&&<button type="button" aria-pressed={mode==='chronological'} onClick={()=>setMode('chronological')}>Ordem cronológica</button>}</div><div><label htmlFor="u-filter">Mostrar</label><select id="u-filter" value={user?filter:'all'} onChange={event=>setFilter(event.target.value)}><option value="all">Todos</option><option disabled={!user} value="seen">Vistos</option><option disabled={!user} value="unseen">Não vistos</option></select><label htmlFor="u-sort">Ordenar</label><select id="u-sort" value={sort} onChange={event=>setSort(event.target.value)}><option value="order">Ordem da saga</option><option value="rating">Nota do catálogo</option><option value="year">Ano</option></select></div></div>
      {data.partial&&<p className="u-hint" role="status">Parte do catálogo está temporariamente indisponível. <button onClick={state.retry}>Atualizar seleção</button></p>}<p className="u-hint">{rows.length} filmes nesta seleção. “Visto” significa avaliado por você; não marcamos filmes automaticamente.</p>{mode==='chronological'&&<p className="u-hint">Filmes sem posição cronológica definida aparecem no final, em ordem de lançamento. Cenas pós-créditos podem ocorrer em outro período.</p>}{error&&<p role="status">{error}</p>}
      <div className="u-film-grid">{rows.slice(0,limit).map(movie=>{const upcoming=!movie.estreia||!!today&&movie.estreia>today;const seen=user&&isReviewed(reviews,movie.id);return <div className="u-film" key={movie.id}><MovieCard movie={movie} /><span className="u-order-number" aria-label={`Posição ${movie.universeOrder}`}>{String(movie.universeOrder).padStart(2,'0')}</span>{seen&&<span className="u-seen-badge"><Icon name="check" />{" Visto · "}<Icon name="star" />{" "}{formatRating(reviews[`filmes:${movie.id}`].nota)}</span>}{upcoming&&<div className="u-upcoming"><span>Em breve</span><time dateTime={movie.estreia||undefined}>{movie.estreia?releaseLabel(movie.estreia):'Estreia a confirmar'}</time></div>}</div>;})}</div>
      {!rows.length&&<p className="m-empty">Nenhum filme nesta seleção. Ajuste o filtro para continuar explorando.</p>}{rows.length>limit&&<button type="button" className="u-load-more" onClick={()=>setLimit(value=>value+24)}>Mostrar mais filmes ({rows.length-limit} restantes)</button>}</>:null;
  const known=slug&&franchiseBySlug(slug);
  if(slug==='marvel-mcu')return <MarvelUniverse state={state} reviews={reviews} user={user} error={error} average={average} today={today} filter={filter} setFilter={setFilter} media={media} onMediaChange={changeMedia} originMedia={originMedia}/>;
  return <UniverseShell media={originMedia} title={data?.nome||known?.nome||'Universo'} className={landing?`cinematic-film-universe ${landing.className}`:''}><main style={{'--universe-accent':data?.cor||known?.cor||'#b69ade'}}>
    {!data&&state.loading?<div className="m-container u-loading"><div className="u-hero-skeleton m-skeleton" /><PosterSkeletons /></div>:state.error?<div className="m-container u-loading"><Link href="/universos"><Icon name="arrow-left" />{" Todos os universos"}</Link><MovieFailure message={state.error} retry={state.retry} /></div>:data&&<>
      {slug==='star-wars'&&<StarWarsUniverse data={data} average={average} reviews={reviews} user={user}/>}
      {slug==='harry-potter'&&<HarryPotterUniverse data={data} average={average} reviews={reviews} user={user}/>}
      {['terra-media','jurassic'].includes(slug)&&<CinematicMovieUniverse data={data} average={average} reviews={reviews} user={user} landing={landing} media={originMedia} shared={!!shared}/>}
      {slug==='dc'&&<DCUniverse data={data} average={average} reviews={reviews} user={user} today={today} filter={filter} setFilter={setFilter}/>}
      {!landing&&<section className="u-hero">{data.backdrop&&<img src={data.backdrop} srcSet={movieUniverseSrcSet(data.backdrop)} sizes="100vw" alt={`Cena do universo ${data.nome}`} fetchPriority="high" decoding="async" />}<div className="u-hero-shade" /><div className="m-container u-hero-copy"><Link href="/universos"><Icon name="arrow-left" />{" Todos os universos"}</Link><p className="m-eyebrow">SEU PRÓXIMO UNIVERSO</p><h1>{data.nome}</h1><p>{data.descricao}</p><div className="u-hero-stats"><span><strong>{data.total}</strong> filmes</span><span><strong>{average.loading?'…':formatRating(average.rating)}</strong> / 5 no Void</span></div>{average.error&&<small>Nota da comunidade indisponível.</small>}{!average.loading&&!average.error&&average.rating===null&&<small>Ainda não há avaliações públicas desta franquia.</small>}{user?<UniverseProgress seen={franchiseProgress(data.movies.map(m=>m.id),reviews)} total={data.total} />:<Link className="u-login" href="/conta">{"Entre para acompanhar seu progresso "}<Icon name="arrow-right" /></Link>}</div></section>}
      <section id={landing?`${landing.prefix}-filmes`:undefined} className="m-container u-film-section">{landing&&<div className="sw-landing sw-catalog-heading"><p className="sw-eyebrow">ESCOLHA SEU PRÓXIMO CAPÍTULO</p><h2>Explore a saga</h2></div>}{shared?<UniverseMediaCatalog slug={slug} media={media} onMediaChange={changeMedia} reviews={reviews} user={user} error={error}>{filmCatalog}</UniverseMediaCatalog>:filmCatalog}
      </section>
    </>}
  </main></UniverseShell>;
}
