import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useAccount } from '../AccountProvider';
import MovieHeader from '../movies/MovieHeader';
import CatalogFooter from '../movies/CatalogFooter';
import { MovieImage } from '../movies/MovieUI';
import Icon from '../Icon';
import DetailModal from '../movies/DetailModal';
import { formatRating } from '../../lib/catalog';
import { FEED_DEFAULTS, activeFeedFilters, feedFilterQuery, normalizeFeedFilters } from '../../lib/reviews-feed';
import { useReviewsFeed } from '../../lib/use-reviews-feed';
import FeedFilters, { FEED_OPTIONS, chipLabel } from './FeedFilters';
import SeriesReviewCard from './SeriesReviewCard';
import FeedAudienceSwitch from './FeedAudienceSwitch';

function FeedSkeleton() {return <div className="gr-skeleton-list" role="status" aria-label="Carregando avaliações">{Array.from({length:4},(_,index)=><div key={index} className="gr-skeleton"><span/><div><i/><i/><i/></div></div>)}</div>;}
const PAGE_SIZE=12;
function FeedSidebar({ feed, friends,media }) {
  return <aside className="gr-sidebar" aria-label="Destaques das avaliações"><section><p className="gr-eyebrow">{friends?'NO SEU CÍRCULO':'NA COMUNIDADE'}</p><h2>{media.key==='animes'?'Animes':'Séries'} em destaque</h2><div className="gr-sidebar-rail">{feed.top_games?.map(series=><Link key={series.item_key} href={`/obra/${media.key}/${series.item.id}`} className="gr-top-game"><MovieImage movie={series.item}/><span><strong>{series.item.titulo}</strong><small><Icon name="star"/> {formatRating(Number(series.average))} / 5</small></span></Link>)}</div>{!feed.top_games?.length&&<p>A semana ainda está começando por aqui.</p>}</section>
  </aside>;
}
export default function SeriesReviewsFeed({ media }) {
  const router=useRouter(),{client,user}=useAccount(),[drawer,setDrawer]=useState(null),[search,setSearch]=useState(null);
  const filters=normalizeFeedFilters({...router.query,platform:'',genre:'',status:''}),chips=activeFeedFilters(filters);
  useEffect(()=>{setSearch(null);setDrawer(null);},[router.asPath]);
  const feed=useReviewsFeed(client,user?.id,filters,router.isReady,media.key);
  const pageScope=JSON.stringify([user?.id||'guest',filters]);
  const [selection,setSelection]=useState({});
  useEffect(()=>{setSelection({scope:pageScope,page:0});},[pageScope]);
  const page=selection.scope===pageScope?selection.page:0;
  const totalPages=Math.max(1,Math.ceil((feed.total||0)/PAGE_SIZE));
  const pageRows=(feed.rows||[]).slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
  const pageLoading=!feed.loading&&!feed.error&&!feed.login&&!pageRows.length&&feed.has_more;
  useEffect(()=>{
    if(pageLoading&&!feed.moreLoading&&!feed.moreError)feed.more();
  },[pageLoading,feed.moreLoading,feed.moreError,feed.rows?.length]);
  useEffect(()=>{
    if(!feed.loading&&!feed.error&&feed.total!==undefined&&page>=totalPages)setSelection({scope:pageScope,page:totalPages-1});
  },[feed.loading,feed.error,feed.total,page,totalPages,pageScope]);
  function paginate(next){setSelection({scope:pageScope,page:next});document.getElementById('gr-feed')?.scrollIntoView({block:'start'});}
  function refresh(){setSelection({scope:pageScope,page:0});feed.refresh();}
  const firstPage=Math.max(0,Math.min(page-2,totalPages-5));
  const pageNumbers=Array.from({length:Math.min(5,totalPages)},(_,index)=>firstPage+index);
  function change(patch) {return router.push({pathname:media.path,query:feedFilterQuery({...filters,...patch})},undefined,{shallow:true,scroll:false});}
  function clear() {setSearch(null);change({...FEED_DEFAULTS,tab:filters.tab,sort:filters.sort});}
  function scrollToNew() {const target=document.getElementById('gr-first-new');if(target){target.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});target.focus({preventScroll:true});}else{change({sort:'recent'});document.getElementById('gr-feed')?.scrollIntoView({block:'start'});}}
  const artSeries=Array.from(new Map((feed.rows||[]).map(review=>[review.item_key,review.item])).values()).slice(0,3);
  const firstNew=pageRows.findIndex(review=>feed.seenAt&&Date.parse(review.created_at)>Date.parse(feed.seenAt));
  return <div className="movies-page game-reviews-page series-reviews-page"><Head><title>Avaliações de {media.label} — VOID</title><meta name="description" content="Avaliações de séries da comunidade VOID e dos seus amigos. Encontre opiniões, notas e novas conversas."/></Head><MovieHeader seriesOnly media={media.key} current="avaliacoes"/>
    <main><header className="gr-hero cr-hero"><div className="gr-container cr-hero-inner"><div><p className="gr-eyebrow">A COMUNIDADE DEIXOU SUA MARCA</p><h1>{media.key==='animes'?'Um anime.':'Uma série.'}<br/>Mil <em>pontos de vista.</em></h1><p className="cr-intro">Descubra o que ficou depois do último episódio. Opiniões, descobertas e novas conversas sobre {media.label}.</p><span className="cr-period gr-period"><Icon name="clock"/>{FEED_OPTIONS.period.find(([value])=>value===filters.period)?.[1]}</span></div><div className="cr-hero-art" aria-hidden="true">{artSeries.map((item,index)=><div className={`cr-art-poster cr-art-${index}`} key={item.id}><MovieImage movie={item}/></div>)}<span className="cr-art-orbit"/></div></div></header><section className="gr-container gr-content" aria-labelledby="gr-heading">

      <FeedAudienceSwitch className="gr-segments" audience={filters.tab==='amigos'?'friends':'community'} onChange={audience=>change({tab:audience==='friends'?'amigos':'comunidade'})}/><div className="gr-section-toolbar"><div className="gr-feed-heading"><p className="gr-eyebrow">{filters.tab==='amigos'?'SEU CÍRCULO NO VOID':'VOZES DO VOID'}</p><h2 id="gr-heading">{filters.tab==='amigos'?'Avaliações dos amigos':'Avaliações da comunidade'}</h2></div><div className="gr-toolbar"><form className="gr-search" onSubmit={event=>{event.preventDefault();change({q:search??filters.q});setSearch(null);}}><label><span>Buscar por título</span><div><Icon name="search"/><input type="search" maxLength={100} value={search??filters.q} placeholder="Nome do título" onChange={event=>setSearch(event.target.value)}/><button type="submit" aria-label="Pesquisar título"><Icon name="arrow-right"/></button></div></label></form><label className="gr-sort"><span>Ordenar</span><select value={filters.sort} onChange={event=>change({sort:event.target.value})}>{FEED_OPTIONS.sort.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><button type="button" className="gr-filter-toggle" aria-expanded={!!drawer} aria-controls="gr-filter-panel" onClick={()=>setDrawer({...filters})}><Icon name="list"/> Filtrar<span aria-label={`${chips.length} filtros ativos`}>{chips.length}</span></button><button className="gr-refresh" disabled={feed.loading||feed.login} onClick={refresh} aria-label="Atualizar avaliações"><Icon name="refresh"/></button></div></div>

      {!!chips.length&&<div className="gr-chips" aria-label="Filtros ativos">{chips.map(([key,value])=><button key={key} onClick={()=>{if(key==='q')setSearch(null);change({[key]:FEED_DEFAULTS[key]});}} aria-label={`Remover ${(key==='q'?`Título: ${value}`:chipLabel(key,value))}`}>{(key==='q'?`Título: ${value}`:chipLabel(key,value))}<Icon name="close"/></button>)}<button className="gr-clear" onClick={clear}>Limpar tudo</button></div>}
      {feed.new_count>0&&!feed.loading&&!feed.error&&<div className="gr-new"><button onClick={scrollToNew}><Icon name="arrow-up"/>Novas desde sua última visita</button></div>}
      <div className="gr-layout"><div className="gr-feed" id="gr-feed">{feed.login?<div className="gr-empty"><Icon name="lock"/><h2>Seu círculo tem lugar aqui.</h2><p>Entre para acompanhar as avaliações públicas dos seus amigos.</p><Link href="/conta?modo=login">Entrar no VOID <Icon name="arrow-right"/></Link></div>:(feed.loading||pageLoading&&!feed.moreError)?<FeedSkeleton/>:feed.error?<div className="gr-empty" role="alert"><Icon name="refresh"/><h2>As opiniões voltam já.</h2><p>Não foi possível carregar as avaliações. Seus filtros continuam salvos.</p><button onClick={refresh}>Tentar novamente</button></div>:!feed.rows?.length?<div className="gr-empty"><span className="gr-empty-cover"><Icon name={filters.tab==='amigos'?'users':'monitor'}/></span><h2>{chips.length?'Nenhuma avaliação com esses filtros.':filters.tab==='amigos'?'Novas conversas vêm aí.':'Toda conversa começa com uma opinião.'}</h2><p>{chips.length?'Experimente ajustar a busca para encontrar outras opiniões.':filters.tab==='amigos'?'Seus amigos ainda não avaliaram {media.label}. Que tal encontrar mais pessoas?':'Ainda não há avaliações públicas neste período. Explore {media.label} e deixe sua marca.'}</p>{chips.length?<button onClick={clear}>Limpar filtros</button>:<Link href={filters.tab==='amigos'?'/amigos':`/${media.key}`}>{filters.tab==='amigos'?'Encontrar pessoas':`Explorar ${media.label}`}<Icon name="arrow-right"/></Link>}</div>:<><div className="gr-feed-list">{pageRows.map((review,index)=><div key={review.user_id+review.item_key} id={index===firstNew?'gr-first-new':undefined} tabIndex={index===firstNew?-1:undefined}><SeriesReviewCard review={review} index={index} community={filters.tab==='comunidade'}/></div>)}</div>{feed.moreError&&pageLoading&&<div role="alert"><p>Não foi possível carregar esta página.</p><button className="gr-load-more" disabled={feed.moreLoading} onClick={feed.more}>Tentar novamente</button></div>}
        </>}
        {!feed.login&&!feed.loading&&!feed.error&&feed.total>0&&<nav className="sr-pagination" aria-label="Páginas de avaliações">
          <p role="status">{PAGE_SIZE} avaliações por página · Página {page+1} de {totalPages}</p>
          <div><button type="button" disabled={page===0} onClick={()=>paginate(page-1)}><Icon name="arrow-left"/> Anterior</button>
          {firstPage>0&&<><button type="button" onClick={()=>paginate(0)}>Página 1</button><span aria-hidden="true">…</span></>}
          {pageNumbers.map(number=><button type="button" key={number} aria-current={page===number?'page':undefined} onClick={()=>paginate(number)}>Página {number+1}</button>)}
          {pageNumbers.at(-1)<totalPages-1&&<span aria-hidden="true">…</span>}
          <button type="button" disabled={page+1>=totalPages} onClick={()=>paginate(page+1)}>Próxima <Icon name="arrow-right"/></button></div>
        </nav>}

      </div>{!feed.login&&!feed.loading&&!feed.error&&<FeedSidebar feed={feed} friends={filters.tab==='amigos'} media={media}/>}</div><p className="gr-privacy"><Icon name="lock"/> Apenas avaliações publicadas. A privacidade de cada perfil continua protegida.</p>
    </section></main><CatalogFooter media={media.key}/>{drawer&&<DetailModal trapFocus id="gr-filter-panel" title="Filtrar avaliações" backdropClassName="gr-filter-backdrop" className="gr-filter-drawer" onClose={()=>setDrawer(null)}><FeedFilters fields={['period','text']} filters={drawer} change={patch=>setDrawer(old=>({...old,...patch}))}/><div className="gr-drawer-actions"><button type="button" onClick={()=>setDrawer({...FEED_DEFAULTS,tab:filters.tab,sort:filters.sort})}>Limpar</button><button type="button" onClick={()=>{change(drawer);setDrawer(null);}}>Aplicar</button></div></DetailModal>}
  </div>;
}
