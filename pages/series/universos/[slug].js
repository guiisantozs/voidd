import {useEffect,useState} from 'react';
import {useRouter} from 'next/router';
import Link from 'next/link';
import Icon from '../../../components/Icon';
import {UniverseShell,UniverseProgress,useUniverseResource,useUniverseReviews} from '../../../components/universes/UniverseUI';
import UniverseLogo from '../../../components/universes/UniverseLogo';
import {MovieCard,MovieFailure,PosterSkeletons} from '../../../components/movies/MovieUI';
import {seriesUniverseBySlug} from '../../../config/series-universes';
import {filterUniverseMovies,franchiseProgress,isReviewed,orderFranchiseMovies} from '../../../lib/franchise-model';
import {movieUniverseSrcSet} from '../../../lib/universe-backdrop';
import {formatRating} from '../../../lib/catalog';
import {sharedUniverses,seriesUniverseHref} from '../../../lib/shared-universes';

export async function getServerSideProps({params}) {
  return sharedUniverses.some(row=>row.seriesSlug===params?.slug)?{redirect:{destination:seriesUniverseHref(params.slug),permanent:false}}:{props:{}};
}

export default function SeriesUniverse(){
  const router=useRouter(),slug=typeof router.query.slug==='string'?router.query.slug:null;
  const state=useUniverseResource(slug?`/api/series/universos/${encodeURIComponent(slug)}`:null);
  const {reviews,user,error}=useUniverseReviews();
  const [mode,setMode]=useState('release'),[filter,setFilter]=useState('all'),[sort,setSort]=useState('order');
  useEffect(()=>{setMode('release');setFilter('all');setSort('order');},[slug]);
  const data=state.data,known=seriesUniverseBySlug(slug);
  const ordered=data?orderFranchiseMovies(data.movies,data.ordem_cronologica,mode):[];
  const rows=filterUniverseMovies(ordered,reviews,user&&!error?filter:'all',sort,'series');
  const seen=data?franchiseProgress(data.movies.map(item=>item.id),reviews,'series'):0;
  return <UniverseShell media="series" title={data?.nome||known?.nome||'Universo de séries'} className="series-universe-detail"><main style={{'--universe-accent':data?.cor||known?.cor||'#b69ade'}}>
    {!data&&state.loading?<div className="m-container u-loading"><div className="u-hero-skeleton m-skeleton"/><PosterSkeletons label="Carregando séries"/></div>:state.error?<div className="m-container u-loading"><Link href="/series/universos"><Icon name="arrow-left"/> Todos os universos de séries</Link><MovieFailure message={state.error} retry={state.retry}/></div>:data&&<>
      <section className="u-hero">
        {data.backdrop&&<img src={data.backdrop} srcSet={movieUniverseSrcSet(data.backdrop)} sizes="100vw" alt={`Cena do universo ${data.nome}`} fetchPriority="high" decoding="async"/>}
        <div className="u-hero-shade"/><div className="m-container u-hero-copy">
          <Link href="/series/universos"><Icon name="arrow-left"/> Todos os universos de séries</Link>
          <p className="m-eyebrow">SÉRIES QUE COMPARTILHAM UM UNIVERSO</p>
          {known?.logo&&<div className="su-detail-logo"><UniverseLogo logo={known.logo} priority/></div>}
          <h1>{data.nome}</h1><p>{data.descricao}</p>
          <div className="u-hero-stats"><span><strong>{data.total}</strong> {data.total===1?'série':'séries'}</span></div>
          {user&&error?<p role="status">Progresso indisponível neste momento.</p>:user?<UniverseProgress seen={seen} total={data.total} label={`Você avaliou ${seen} de ${data.total} ${data.total===1?'série':'séries'}`}/>:<Link className="u-login" href="/conta">Entre para acompanhar seu progresso <Icon name="arrow-right"/></Link>}
        </div>
      </section>
      <section className="m-container u-film-section" aria-labelledby="su-series-title">
        <h2 id="su-series-title">Explore as séries</h2>
        {data.note&&<p className="u-hint su-editorial">{data.note}</p>}
        <div className="u-controls"><div className="u-order-tabs" role="group" aria-label="Ordem das séries"><button type="button" aria-pressed={mode==='release'} onClick={()=>setMode('release')}>Ordem de lançamento</button>{data.ordem_cronologica.length>0&&<button type="button" aria-pressed={mode==='chronological'} onClick={()=>setMode('chronological')}>Ordem cronológica</button>}</div>
          <div><label htmlFor="su-filter">Mostrar</label><select id="su-filter" value={user&&!error?filter:'all'} onChange={event=>setFilter(event.target.value)}><option value="all">Todas</option><option value="seen" disabled={!user||!!error}>Avaliadas</option><option value="unseen" disabled={!user||!!error}>Não avaliadas</option></select><label htmlFor="su-sort">Ordenar</label><select id="su-sort" value={sort} onChange={event=>setSort(event.target.value)}><option value="order">Ordem do universo</option><option value="rating">Nota do catálogo</option><option value="year">Ano</option></select></div>
        </div>
        {data.partial&&<p className="u-hint" role="status">Parte do catálogo está indisponível. O progresso considera apenas as séries carregadas. <button onClick={state.retry}>Atualizar seleção</button></p>}
        <p className="u-hint">O progresso considera suas avaliações da série inteira, inclusive privadas. Não marca temporadas ou episódios automaticamente.</p>
        {error&&<p role="status">{error}</p>}
        <div className="u-film-grid">{rows.map(item=><div className="u-film" key={item.id}><MovieCard movie={item}/><span className="u-order-number" aria-label={`Posição ${item.universeOrder}`}>{String(item.universeOrder).padStart(2,'0')}</span>{user&&!error&&isReviewed(reviews,item.id,'series')&&<span className="u-seen-badge"><Icon name="check"/> Avaliada · <Icon name="star"/> {formatRating(reviews[`series:${item.id}`].nota)}</span>}</div>)}</div>
        {!rows.length&&<p className="m-empty">Nenhuma série nesta seleção. Ajuste o filtro para continuar explorando.</p>}
      </section>
    </>}
  </main></UniverseShell>;
}
