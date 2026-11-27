import { gameUniverseLandings } from '../../../config/game-universe-landings';
import GameUniverseLanding from '../../../components/games/GameUniverseLanding';
import Link from 'next/link';
import { useMemo,useState } from 'react';
import Icon from '../../../components/Icon';
import GameStatus from '../../../components/GameStatus';
import GameCoverCard from '../../../components/games/GameCoverCard';
import GameUniverseShell from '../../../components/games/GameUniverseShell';
import UniverseHeroMotion from '../../../components/games/UniverseHeroMotion';
import UniverseLogo from '../../../components/universes/UniverseLogo';
import UniverseShortcuts from '../../../components/universes/UniverseShortcuts';
import { UniverseProgress,useUniverseResource } from '../../../components/universes/UniverseUI';
import { MovieFailure } from '../../../components/movies/MovieUI';
import { useLibrary } from '../../../lib/use-library';
import { gameStatusKey,gameStatuses } from '../../../lib/library';
import { gameUniverseView, universeGameHref } from '../../../lib/game-universe-model';
import { gameUniverses,gameUniverseBySlug } from '../../../game-universes.config';

export default function GameUniverse({universe}){
  const state=useUniverseResource(`/api/game-universes/${universe.slug}`),library=useLibrary();
  const [query,setQuery]=useState(''),[order,setOrder]=useState('popular'),[platform,setPlatform]=useState(''),[showExtras,setShowExtras]=useState(false);
  const view=useMemo(()=>gameUniverseView(state.data,library.entries,{query,order,platform}),[state.data,library.entries,query,order,platform]);
  const first=state.data?.games?.[0],facts=state.data?.facts;
  function renderCard(item,featured=false){
    const status=item.id?gameStatusKey(library.entries[String(item.id)]):'';
    const label=gameStatuses.find(option=>option.key===status)?.label;
    return <GameCoverCard key={item.igdbId||`extra-${item.id}`} item={item} portraitOnly href={universeGameHref(universe,item)}
      className={`library-cover-card gu-game-card${featured?' gu-start-card':''}`} status={status||undefined}
      badge={label?<span className="library-cover-badge"><span className="library-status-dot" aria-hidden="true"/>{label}</span>:!item.official?<span className="library-cover-badge gu-extra-badge">{item.entryKind==='extra'?'Extra':'Comunidade'}</span>:undefined}
      overlay={!item.official&&label?<span className="gu-extra-kind">{item.entryKind==='extra'?'Extra':'Comunidade'}</span>:undefined}
      footer={item.id?<GameStatus item={item} library={library} compact menuOnly/>:undefined}>
      <p className="library-cover-year gu-game-year">{item.ano||'A anunciar'}{item.gameType===9?' · Remaster':item.gameType===8?' · Remake':item.gameType===11?' · Port':item.gameType===10?' · Edição expandida':''}</p>
      {featured&&<><p className="gu-start-kicker" id="gu-start-title">Comece por aqui</p><p className="gu-start-copy">O primeiro capítulo deste universo. Uma porta de entrada para as histórias que vêm depois.</p><p className="gu-start-platforms">{item.plataformas?.join(' · ')}</p></>}
    </GameCoverCard>;
  }
  const cinematic=!!gameUniverseLandings[universe.slug];
  function renderCatalog(){return (<section id={cinematic?'jogos':undefined} className="m-container gu-games" aria-labelledby="gu-games-title"><div className="game-section-heading"><h2 id="gu-games-title">Explore os jogos</h2><p role="status" aria-live="polite">{state.loading?'Consultando o catálogo…':state.error?'Catálogo indisponível':`${view.games.length} jogos oficiais`}</p></div>
      <div className="gu-control-panel"><div className="gu-controls"><label>Buscar neste universo<span><Icon name="search"/><input type="search" value={query} maxLength={100} onChange={event=>setQuery(event.target.value)} placeholder="Nome do jogo"/></span></label><label>Ordenar<select value={order} onChange={event=>setOrder(event.target.value)}><option value="popular">Ordem de lançamento</option><option value="year">Mais recentes</option><option value="rating">Melhores notas RAWG</option></select></label></div>
        <div className="gu-control-bottom"><div className="gu-platform-chips" role="group" aria-label="Filtrar por plataforma"><button type="button" aria-pressed={!platform} onClick={()=>setPlatform('')}>Todas</button>{view.platforms.map(option=><button type="button" key={option.key} aria-pressed={platform===option.key} onClick={()=>setPlatform(old=>old===option.key?'':option.key)}>{option.label}</button>)}</div><label className="gu-extra-toggle"><input type="checkbox" role="switch" checked={showExtras} onChange={event=>setShowExtras(event.target.checked)}/><span>Mostrar também DLCs e conteúdo da comunidade</span></label></div>
      </div>
      {state.loading?<div className="gu-game-grid library-cover-grid" role="status" aria-label="Carregando jogos oficiais">{Array.from({length:6},(_,index)=><div className="gu-cover-skeleton m-skeleton" key={index}/>)}</div>:state.error?<MovieFailure message={state.error} retry={state.retry}/>:<>
        {state.data?.partial&&<div className="game-notice" role="status"><p>Parte do catálogo está temporariamente indisponível. Os jogos já confirmados continuam abaixo.</p><button type="button" onClick={state.retry}>Tentar novamente</button></div>}
        {view.years.length>1&&<ol className="gu-timeline" aria-label="Linha do tempo de lançamentos">{view.years.map(value=><li key={value}>{value}</li>)}</ol>}
        {view.start&&<section className="gu-start-section" aria-labelledby="gu-start-title">{renderCard(view.start,true)}</section>}
        {view.groups.map(group=><section className="gu-game-section" key={group.key} aria-labelledby={`gu-${group.key}`}><div className="gu-section-heading"><h2 id={`gu-${group.key}`}>{group.label}</h2><span>{group.games.length}</span><i aria-hidden="true"/></div><div className="gu-game-grid library-cover-grid">{group.games.map(item=>renderCard(item))}</div></section>)}
        {!view.games.length&&<div className="game-empty gu-empty"><div className="gu-empty-cover" aria-hidden="true"><Icon name="gamepad"/></div><div><h3>Nenhum jogo oficial encontrado para este universo ainda</h3><p>{query||platform?'Experimente outro nome ou plataforma para encontrar sua próxima jornada.':'Novos jogos confirmados aparecerão aqui.'}</p>{(query||platform)&&<button type="button" className="game-button-outline" onClick={()=>{setQuery('');setPlatform('');}}>Limpar filtros</button>}</div></div>}
        {showExtras&&view.extras.length>0&&<section className="gu-game-section gu-extras-section" aria-labelledby="gu-extras"><div className="gu-section-heading"><h2 id="gu-extras">DLCs e conteúdo da comunidade</h2><span>{view.extras.length}</span><i aria-hidden="true"/></div><p className="gu-selection-note">Conteúdo extra e projetos independentes. Estes itens não contam como jogos oficiais nem entram no progresso.</p><div className="gu-game-grid library-cover-grid">{view.extras.map(item=>renderCard(item))}</div></section>}
      </>}
      <p className="gu-attribution">Metadados e capas oficiais: <a href="https://www.igdb.com/" target="_blank" rel="noreferrer">IGDB</a> · Catálogo e notas: <a href="https://rawg.io/" target="_blank" rel="noreferrer">RAWG</a></p>
    </section>);}
  function renderOtherUniverses(){return (<div id={cinematic?'outros-universos':undefined} className="gu-other-universes"><p className="m-container m-eyebrow">EXPLORAR OUTROS UNIVERSOS</p><UniverseShortcuts items={gameUniverses.filter(item=>item.slug!==universe.slug)} basePath="/jogos/universos" media="jogos" id="other-game-universes-title"/></div>);}
  return <GameUniverseShell className={cinematic?`cinematic-universe ${gameUniverseLandings[universe.slug].themeClass||(universe.slug==='god-of-war'?'gow-universe':'tlou-universe')}`:''} title={universe.nome} description={universe.descricao}><main style={{'--universe-accent':universe.accent}}>
    {cinematic?<GameUniverseLanding key={universe.slug} universe={universe} data={state.data} view={view} otherUniverses={renderOtherUniverses()}>{renderCatalog()}</GameUniverseLanding>:<><UniverseHeroMotion><section className="u-hero gu-hero" aria-labelledby="gu-title">
      {state.data?.backdrop&&<img src={state.data.backdrop} alt="" decoding="async"/>}<div className="u-hero-shade" aria-hidden="true"/>
      <div className="m-container u-hero-copy"><Link href="/jogos/universos"><Icon name="arrow-left"/>Todos os universos de jogos</Link>
        <div className="gu-hero-layout"><div className="gu-hero-text"><p className="m-eyebrow">UM UNIVERSO PARA EXPLORAR</p><h1 id="gu-title">{universe.nome}</h1><p className="gu-description">{universe.descricao}</p></div><div className="gu-hero-logo" aria-hidden="true"><UniverseLogo logo={universe.logo}/></div></div>
        <div className="u-hero-stats gu-facts" aria-label="Sobre este universo"><span><Icon name="gamepad"/><strong>{state.data?state.data.total:'—'}</strong>jogos oficiais</span><span><Icon name="calendar"/>{facts?.firstYear?`${facts.firstYear} — ${facts.lastYear}`:'Histórias para explorar'}</span><span><Icon name="monitor"/>{view.platforms.map(option=>option.label).join(' · ')||'Plataformas'}</span><span><Icon name="users"/>{universe.mainStudio}</span></div>
        {state.data&&(view.hasLibraryGames?<UniverseProgress seen={view.finished} total={state.data.total} label={`Você finalizou ${view.finished} de ${state.data.total}`} description="Jogos finalizados ou platinados neste universo"/>:first&&<Link className="gu-start-invite" href={universeGameHref(universe,first)}>Comece por aqui <Icon name="arrow-right"/></Link>)}
      </div>
    </section></UniverseHeroMotion>{renderCatalog()}</>}

    {!cinematic&&renderOtherUniverses()}
  </main></GameUniverseShell>;
}
export function getStaticPaths(){return {paths:gameUniverses.map(universe=>({params:{slug:universe.slug}})),fallback:false};}
export function getStaticProps({params}){const universe=gameUniverseBySlug(params.slug);return universe?{props:{universe}}:{notFound:true};}
