import { GameDiscoverySearch, GameReleases } from '../components/GameDiscovery';
import Icon from '../components/Icon';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { GameCard, GamesFooter, GamesHeader } from '../components/GameUI';
import { platforms } from '../lib/games';
import { itemKey, readReviews } from '../lib/catalog';
import GameHero from '../components/GameHero';
import WeeklyFeature from '../components/movies/WeeklyFeature';
import { useGameHighlights } from '../lib/use-game-highlights';
import { gameBanners } from '../lib/game-banners';
import highlights from '../game-highlights.config';
import { useLibrary } from '../lib/use-library';
import { useGameSearch } from '../lib/use-game-search';
import RecommendedGames from '../components/games/RecommendedGames';
import UniverseShortcuts from '../components/universes/UniverseShortcuts';
import { gameUniverses } from '../game-universes.config';

export default function Jogos() {
  const router = useRouter();
  const spotlight = useGameHighlights();
  const [storageNotice, setStorageNotice] = useState('');
  const [query, setQuery] = useState('');
  const [searchRequested, setSearchRequested] = useState(false);
  const [platform, setPlatform] = useState('all');
  const [recommendedPlatform, setRecommendedPlatform] = useState('all');
  const [genre, setGenre] = useState('all');
  const [year, setYear] = useState('');
  const [order, setOrder] = useState('popular');
  const collection = useLibrary();
  const [reviews, setReviews] = useState({});
  const tag=typeof router.query.tag==='string'?router.query.tag:'';
  const developer=typeof router.query.developer==='string'?router.query.developer:'';
  const publisher=typeof router.query.publisher==='string'?router.query.publisher:'';
  const activeSearch = searchRequested || !!query.trim() || genre !== 'all' || !!year || platform !== 'all' || !!tag || !!developer || !!publisher;
  const search = useGameSearch({ query, platform, genre, order, year, tag, developer, publisher, enabled: activeSearch });
  const { items, loading, notice } = search;
  useEffect(() => {
    try { setReviews(readReviews()); } catch { setStorageNotice('N\u00e3o foi poss\u00edvel ler as avalia\u00e7\u00f5es deste navegador.'); }
  }, []);
  const shown = items;
  const results = activeSearch ? <section className="games-discover game-search-results" id="game-search-results">
    <div className="game-section-heading"><h2>Resultados da busca</h2></div>
    <div className="games-filters"><label><span className="sr-only">Ordenar</span><select value={order} onChange={e => setOrder(e.target.value)}><option value="popular">Ordem do catálogo</option><option value="rating">Melhores notas</option><option value="year">Mais recentes</option></select></label></div>
    <div className="games-results-label"><p>{shown.length} jogos · {platform === 'all' ? 'Todas as plataformas' : platform}</p><span>{search.editorial ? 'Seleção editorial' : search.total.toLocaleString('pt-BR') + (search.totalIsLowerBound && search.hasNext ? '+' : '') + ' resultados no catálogo'}</span></div>
    {notice && <div className="game-notice" role="status"><p>{notice}</p><button onClick={search.retry}>Tentar conexão <Icon name="refresh" /></button></div>}
    {storageNotice && <p className="game-notice" role="status">{storageNotice}</p>}
    {loading && <p className="game-loading" role="status">Buscando jogos…</p>}
    <div className="games-grid" aria-busy={loading}>{(!loading ? shown : []).map(item => <GameCard key={itemKey(item)} item={item} review={reviews[itemKey(item)]} library={collection} />)}</div>
    {!shown.length && !loading && <div className="game-empty"><span><Icon name="sparkle" /></span><h3>Nenhum jogo encontrado.</h3><p>Experimente outro título, plataforma ou gênero.</p><button className="game-button" onClick={() => {setSearchRequested(false);setQuery('');setPlatform('all');setGenre('all');setYear('');}}>Limpar busca <Icon name="arrow-up-right" /></button></div>}
    {!search.editorial && <nav className="games-pagination" aria-label="Páginas do catálogo"><button disabled={loading || search.page <= 1} onClick={() => search.changePage(search.page - 1)}><Icon name="arrow-left" /> Anterior</button><span>Página {search.page}</span><button disabled={loading || !search.hasNext} onClick={() => search.changePage(search.page + 1)}>Próxima <Icon name="arrow-right" /></button></nav>}
  </section> : null;
  return <div className="games-shell games-home"><Head><title>Jogos — VOID</title><meta name="description" content="Explore jogos e registre suas avaliações no VOID." /></Head><GamesHeader utilityNavigation />
    <main><GameHero highlights={gameBanners(highlights, spotlight.state.games)} /><GameDiscoverySearch query={query} setQuery={setQuery} genre={genre} setGenre={setGenre} year={year} setYear={setYear} onSearch={() => setSearchRequested(true)}>{results}</GameDiscoverySearch>{spotlight.state.refreshError&&<p className="game-weekly-basis m-container" role="status">{spotlight.state.refreshError}</p>}<GameReleases state={spotlight.state.loading ? {loading:true} : spotlight.state.recent || {error:spotlight.state.error}} retry={spotlight.retry} /><WeeklyFeature media="jogos" state={{...spotlight.state,...spotlight.state.featured}} retry={spotlight.retry} />
    <UniverseShortcuts items={gameUniverses} basePath="/jogos/universos" media="jogos" id="game-universe-shortcuts-title" />
    <GameReleases mode="trending" state={spotlight.state.loading ? {loading:true} : spotlight.state.trending || {error:spotlight.state.error}} retry={spotlight.retry} library={collection} />
    <GameReleases upcoming state={spotlight.state.loading ? {loading:true} : spotlight.state.upcoming || {error:spotlight.state.error}} retry={spotlight.retry} library={collection} reviews={reviews} />
    <RecommendedGames platform={recommendedPlatform} excluded={[...(spotlight.state.games || []),...(spotlight.state.featured?.games || []), {id:972995,title:'Grand Theft Auto VI'}]} highlightsLoading={spotlight.state.loading} library={collection} onViewAll={() => {setQuery('');setGenre('all');setYear('');setOrder('rating');setPlatform(recommendedPlatform);setSearchRequested(true);}}/>
    <div className="games-main games-home-content"><section className="games-platforms"><div className="game-section-heading"><h2><span><Icon name="monitor" /></span> Plataformas</h2><p>Filtre por onde você joga.</p></div><div className="platform-grid" role="group" aria-label="Filtrar jogos recomendados por plataforma">{platforms.map(item => <button className={recommendedPlatform === item.key ? 'selected' : ''} key={item.key} aria-pressed={recommendedPlatform === item.key} onClick={() => {setRecommendedPlatform(item.key);}}><span className="platform-mark" aria-hidden="true">{item.logo ? <img src={item.logo} alt="" width={37} height={37} /> : <Icon name={item.mark} />}</span><strong>{item.label}</strong><small>{item.sub}</small></button>)}</div></section>
    </div></main><GamesFooter /></div>;
}

export function getServerSideProps({ query }) {
  if (query.view === 'library') {
    const status = typeof query.status === 'string' ? '?status=' + encodeURIComponent(query.status) : '';
    return { redirect: { destination: '/jogos/biblioteca' + status, permanent: false } };
  }
  return { props: {} };
}
