import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Icon from './Icon';
import GameDetailHero from './GameDetailHero';
import { GamesFooter, GamesHeader } from './GameUI';
import { useMovieReviewSummary } from './movies/MovieReviews';
import GameReviewForm from './games/GameReviewForm';
import GameCommunity from './games/GameCommunity';
import GameMedia from './games/GameMedia';
import SimilarGames from './games/SimilarGames';
import GameOverview from './games/GameOverview';
import { PersonalGameStatus } from './GameStatus';
import AddToList from './lists/AddToList';
import { useAccount } from './AccountProvider';
import { scopedStorage, REVIEWS_KEY, DATA_EVENT } from '../lib/account-storage';
import { GAME_REVIEW_REQUESTED } from '../lib/game-journey';
import { useRouter } from 'next/router';
import { useAvatars } from '../lib/use-avatars';
import WorkAvatars from './avatars/WorkAvatars';
import { ConnectedGameHistory } from './games/GameCollection';

import { gameDetailTabs as baseSections, gameDetailTab } from '../lib/game-detail-tabs';
import {useGameOverviewData,HERO_MEDIA_PARTS} from '../lib/use-game-overview-data';
import {publicStorePoster} from '../lib/game-key-art';

function GameExperience({ item, onReviewSaved }) {
  const { user } = useAccount();
  const router=useRouter(),avatars=useAvatars('jogos',item.id);
  const sections=avatars.rows.length?[...baseSections,['avatares',`Avatares ${avatars.rows.length}`]]:baseSections;
  const [review, setReview] = useState(null);
  const [revision, setRevision] = useState(0), [active, setActive] = useState('visao-geral'), [favoriteIntent, setFavoriteIntent] = useState(0);
  const [reviewVisited, setReviewVisited] = useState(false);
  const [reviewIntent,setReviewIntent]=useState(null);
  const tabButtons = useRef([]);
  const lastLocation = useRef('');
  const summary = useMovieReviewSummary(item.id, revision, 'jogos');
  const media=useGameOverviewData(item,{parts:HERO_MEDIA_PARTS});
  const heroItem={...item,screenshots:media.state.screenshots?.data??item.screenshots??[],trailer:media.state.trailer?.data??item.trailer??null,storePoster:item.storePoster||publicStorePoster(media.state.stores?.data||[])};
  useEffect(() => {
    function read() {
      try { setReview(JSON.parse(scopedStorage(localStorage, user?.id || null).getItem(REVIEWS_KEY) || '{}')[`jogos:${item.id}`] || null); }
      catch { /* Saving still validates the original storage before any write. */ }
    }
    read(); window.addEventListener(DATA_EVENT, read); window.addEventListener('storage', read);
    return () => { window.removeEventListener(DATA_EVENT, read); window.removeEventListener('storage', read); };
  }, [item.id, user?.id]);
  function selectTab(id, scroll = false, intent = {}) {
    if(id==='listas-status'){
      requestAnimationFrame(()=>{const status=document.getElementById('game-hero-status');status?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});(status?.querySelector('select:not(:disabled),button:not(:disabled)')||status)?.focus({preventScroll:true});});
      return;
    }
    const target = gameDetailTab(id,sections); setActive(target);
    const query={...router.query};
    if(target==='avatares')query.tab='avatares';else if(query.tab==='avatares')delete query.tab;
    if(window.location.hash!=='#'+id||query.tab!==router.query.tab)router.push({pathname:router.pathname,query,hash:id},undefined,{shallow:true,scroll:false});
    if (target === 'sua-jornada') {setReviewVisited(true);setReviewIntent(old=>({key:(old?.key||0)+1,...intent}));}
    if (scroll) requestAnimationFrame(() => document.getElementById('game-panel-'+target)?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));
  }
  useEffect(() => {
    const changed = () => {
      const params=new URLSearchParams(window.location.search),hash=window.location.hash.slice(1);
      const target=gameDetailTab(hash||(params.get('tab')==='avatares'?'avatares':'visao-geral'),sections);
      setActive(target);
      if(target==='sua-jornada'){
        setReviewVisited(true);
        if(params.get('editar')==='1'&&lastLocation.current!==window.location.href)setReviewIntent(old=>({...old,key:(old?.key||0)+1,edit:true}));
      }
      lastLocation.current=window.location.href;
      if(hash)requestAnimationFrame(()=>document.getElementById('game-panel-'+target)?.scrollIntoView({block:'start',behavior:'instant'}));
    };
    changed(); window.addEventListener('hashchange',changed);router.events.on('hashChangeComplete',changed);router.events.on('routeChangeComplete',changed);
    return () => {window.removeEventListener('hashchange',changed);router.events.off('hashChangeComplete',changed);router.events.off('routeChangeComplete',changed);};
  }, [item.id,avatars.rows.length]);
  useEffect(()=>{if(active==='avatares'&&!avatars.loading&&!avatars.rows.length)setActive('visao-geral');},[active,avatars.loading,avatars.rows.length]);
  useEffect(()=>{
    const receive=event=>{if(event.detail?.owner===(user?.id||null)&&event.detail?.id===String(item.id))selectTab('sua-jornada',true);};
    window.addEventListener(GAME_REVIEW_REQUESTED,receive);return()=>window.removeEventListener(GAME_REVIEW_REQUESTED,receive);
  },[item.id,user?.id]);
  function saved(record) { setReview(record); onReviewSaved?.(record); setRevision(n => n + 1); }
  return <><GameDetailHero keyArtReady={!media.state.stores?.loading} item={heroItem} review={review} summary={summary} onReviewSaved={saved} onSection={id=>selectTab(id,true)} onRate={rating=>selectTab('sua-jornada',true,{rating,edit:true})} onFavorite={() => { setFavoriteIntent(n => n + 1); selectTab('sua-jornada',true,{edit:true}); }}/>
    <nav className="gp-section-nav" role="tablist" aria-label="Navegação neste jogo">{sections.map(([id,label],index) => <button type="button" role="tab" id={'game-tab-'+id} ref={node=>{tabButtons.current[index]=node;}} key={id} aria-selected={active===id} aria-controls={'game-panel-'+id} tabIndex={active===id?0:-1} onClick={()=>selectTab(id,true)} onKeyDown={event=>{let next=index;if(event.key==='ArrowRight')next=(index+1)%sections.length;else if(event.key==='ArrowLeft')next=(index-1+sections.length)%sections.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=sections.length-1;else return;event.preventDefault();selectTab(sections[next][0],true);tabButtons.current[next]?.scrollIntoView({block:'nearest',inline:'nearest'});tabButtons.current[next]?.focus({preventScroll:true});}}>{label}</button>)}</nav>
    <div className="gp-content gp-tab-content">{sections.map(([id])=><div key={id} role="tabpanel" id={'game-panel-'+id} aria-labelledby={'game-tab-'+id} hidden={active!==id} tabIndex={0}>
      {id==='visao-geral' && active===id && <GameOverview key={item.id} item={item} review={review} summary={summary} revision={revision} media={media} onSection={id=>selectTab(id,true)}/>}
      {id==='sua-jornada' && reviewVisited && <div className="gp-overview-layout"><GameReviewForm key={item.id} item={item} review={review} onSaved={saved} favoriteIntent={favoriteIntent} reviewIntent={reviewIntent}/><aside className="gp-sidebar"><section className="gp-panel"><p className="gp-overline">DO SEU JEITO</p><h2>Sua jornada</h2><PersonalGameStatus item={item} chips/><AddToList item={item}/></section></aside></div>}
      {(id==='comunidade'||id==='amigos') && active===id && <GameCommunity key={item.id+':'+id} section={id==='amigos'?'friends':'community'} item={item} summary={summary} revision={revision}/>}
      {id==='midia' && active===id && <GameMedia key={'media:'+item.id} item={heroItem}/>}
      {id==='meu-historico' && active===id && (user ? <ConnectedGameHistory rawgId={item.id} /> : <p>Entre na sua conta VOID para ver seu histórico conectado.</p>)}
      {id==='avatares' && active===id && <WorkAvatars item={item} catalog={avatars}/>}
      {id==='jogos-parecidos' && active===id && <SimilarGames key={'similar:'+item.id} item={item}/>}
    </div>)}</div></>;

}

export default function GameDetail({ item, review, loading, error, warning, retry, onReviewSaved }) {
  const { user } = useAccount();
  return <div className="games-shell game-detail-shell game-full-page gp-page"><Head><title>{item ? `${item.titulo} — Void Play` : 'Explorar jogo — Void Play'}</title><meta name="description" content={item?.sinopse?.slice(0,155) || 'Descubra jogos, registre sua avaliação e encontre opiniões da comunidade no Void Play.'}/></Head><GamesHeader/><main className="game-full-main">
    {loading ? <div className="game-detail-loading" role="status"><span className="logo">void.</span><p>Carregando seu próximo universo…</p></div> : error ? <section className="game-empty" role="alert"><h1>Não foi possível carregar o jogo.</h1><p>{error}</p><button className="game-button" onClick={retry}>Tentar novamente <Icon name="refresh"/></button></section> : item && <>{warning && <div className="game-notice" role="status"><p>{warning}</p><button onClick={retry}>Atualizar <Icon name="refresh"/></button></div>}<GameExperience key={`${item.id}:${user?.id || 'guest'}`} item={item} review={review} onReviewSaved={onReviewSaved}/></>}
  </main><GamesFooter/></div>;
}
