import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GamesHeader, GamesFooter } from '../../components/GameUI';
import LibraryGameCard from '../../components/games/LibraryGameCard';
import LibraryOverview, { LibraryRow } from '../../components/games/LibraryOverview';
import LibraryFilters from '../../components/games/LibraryFilters';
import LibrarySurface, { LibraryStatusRail, libraryStatusIcons } from '../../components/games/LibraryVisuals';
import Icon from '../../components/Icon';
import { useAccount } from '../../components/AccountProvider';
import { useLibrary } from '../../lib/use-library';
import { DATA_EVENT } from '../../lib/account-storage';
import { itemKey, readReviews, formatRating } from '../../lib/catalog';
import { parseRating } from '../../lib/ratings';
import { gameLibraryView, libraryEmpty, libraryFilters, libraryStatus } from '../../lib/game-library-view';
import { parseLibraryQuery, libraryQueryUpdate, libraryFilterChips } from '../../lib/game-library-filters';

export default function Biblioteca() {
  const router = useRouter();
  const { user } = useAccount();
  const library = useLibrary();
  const [reviews, setReviews] = useState({});
  const [reviewsReady, setReviewsReady] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [view,setView]=useState('covers');
  useEffect(()=>{try{setView(localStorage.getItem('void:library-view')==='compact'?'compact':'covers');}catch{}},[]);
  function changeView(next){setView(next);try{localStorage.setItem('void:library-view',next);}catch{}}
  const filters = parseLibraryQuery(router.query);
  const { status } = filters;
  const pendingQuery = useRef(router.query);
  useEffect(() => { pendingQuery.current = router.query; }, [router.asPath]);
  useEffect(() => {
    function refresh() {
      try { setReviews(readReviews()); setError(''); }
      catch { setReviews({}); setError('Não foi possível ler suas avaliações neste navegador.'); }
      setReviewsReady(true);
    }
    refresh();
    window.addEventListener(DATA_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(DATA_EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, []);
  const ready = router.isReady && library.ready && reviewsReady;
  const { items, counts, totalCounts, summary, playing, shelves, genres } = useMemo(
    () => gameLibraryView(library.entries, reviews, filters),
    [library.entries, reviews, filters.status, filters.platform, filters.genre, filters.yearFrom, filters.yearTo, filters.minRating, filters.q, filters.order]
  );
  const chips = libraryFilterChips(filters, genres);
  function updateFilters(changes) {
    const next = libraryQueryUpdate(pendingQuery.current, changes);
    if (JSON.stringify(next) === JSON.stringify(libraryQueryUpdate(pendingQuery.current, {}))) return;
    pendingQuery.current = next;
    router.push({ pathname: '/jogos/biblioteca', query: pendingQuery.current }, undefined, { shallow: true, scroll: false });
  }
  function clearFilters() {
    pendingQuery.current = {};
    router.push('/jogos/biblioteca', undefined, { shallow: true, scroll: false });
  }
  function filter(next) {
    updateFilters({ status: next });
  }
  const controls = { ...library, update(item, next) {
    if (!library.update(item, next)) return false;
    const label = libraryFilters.find(option => option.key === (next || 'none')).label;
    setMessage(`${item.titulo}: ${label}. Status salvo.`);
    return true;
  } };
  function renderCard(item, highlighted = false) {
    const current = libraryStatus(item, library.entries);
    const rating = parseRating(reviews[itemKey(item)]?.nota);
    return <LibraryGameCard key={itemKey(item)} item={item} current={current} rating={rating} library={controls} highlighted={highlighted} showBadge={view==='compact'&&status==='all'}/>;
  }
  return <LibrarySurface className="games-shell games-library library-design library-hud"><Head><title>Biblioteca - VOID</title><meta name="description" content="Sua biblioteca pessoal de jogos no VOID." /></Head><GamesHeader />
    <main className="games-main library-main"><header className="game-section-heading library-page-heading"><div><p className="library-eyebrow">SUA JORNADA</p><h1>Minha Biblioteca</h1></div><Link className="game-button-outline" href="/jogos">Explorar jogos <Icon name="arrow-up-right" /></Link></header>
      <LibraryOverview counts={totalCounts} summary={summary} ready={ready} />
      {ready && playing.length > 0 && <LibraryRow id="library-playing" title="Jogando agora" count={playing.length} status="playing_now" className="library-playing">{playing.map(item => renderCard(item, true))}</LibraryRow>}
      {ready&&playing.length===0&&<section className="library-playing-empty" data-status="playing_now"><Icon name="gamepad"/><div><p className="library-eyebrow">PRONTO PARA A PRÓXIMA SESSÃO?</p><h2>Seu próximo jogo espera por você</h2><p>Escolha um jogo de Quero jogar e marque Jogando agora para começar.</p></div><button type="button" className="game-button-outline" onClick={()=>filter('want')}>Ver Quero jogar <Icon name="arrow-right"/></button></section>}
      <LibraryStatusRail active={status}>{libraryFilters.map(option => <button type="button" data-status={option.key} key={option.key} aria-pressed={status === option.key} onClick={() => filter(option.key)}><span className="library-tab-dot" aria-hidden="true" />{option.label}<span>{ready ? counts[option.key] : '—'}</span></button>)}</LibraryStatusRail>
      <p className="library-local-note"><Icon name="lock" /><span>{user ? 'Lista privada sincronizada com sua conta.' : 'Lista pessoal salva neste navegador.'} “Sem status” reúne jogos avaliados que você ainda não classificou.</span></p>
      <LibraryFilters filters={filters} genres={genres} chips={chips} update={updateFilters} clear={clearFilters} view={view} onView={changeView} />
      <div className="games-results-label"><p data-status={status} className="library-result-count">{ready ? `${items.length} ${items.length === 1 ? 'jogo' : 'jogos'}` : 'Carregando biblioteca…'}</p><span>Biblioteca privada</span></div>

      <p className="library-feedback" role="status" aria-live="polite">{message}</p>
      {(library.error || error) && <p className="game-notice" role="alert">{library.error || error}</p>}
      {!ready ? <div className="library-cover-grid" aria-busy="true" aria-label="Carregando jogos da biblioteca">{Array.from({ length: 12 }, (_, index) => <div className="library-skeleton" key={index} aria-hidden="true"><div className="m-skeleton" /><span className="m-skeleton" /></div>)}</div>
        : view==='compact'?<div className="library-compact" aria-label="Lista compacta de jogos">{items.map(item=>renderCard(item))}</div>:status === 'all' ? <div className="library-shelves">{shelves.filter(shelf=>shelf.key!=='playing_now').map(shelf => <LibraryRow key={shelf.key} id={`library-shelf-${shelf.key}`} title={shelf.label} count={shelf.items.length} status={shelf.key} onViewAll={() => filter(shelf.key)}>{shelf.items.map(item => renderCard(item))}</LibraryRow>)}</div>
          : <div className="library-cover-grid" aria-label="Jogos da biblioteca">{items.map(item => renderCard(item))}</div>}
      {ready && !library.error && !error && !items.length && <div className="game-empty library-empty" data-status={status}><div className="library-empty-cover" aria-hidden="true"><Icon name={libraryStatusIcons[status]} /></div><div className="library-empty-copy"><h2>{chips.length ? 'Nenhum jogo com esses filtros.' : 'Nenhum jogo nesta seleção.'}</h2><p>{chips.length ? 'Experimente outra combinação ou limpe os filtros para ver sua biblioteca.' : libraryEmpty[status]}</p><div className="library-empty-actions">{chips.length > 0 && <button className="game-button-outline" onClick={clearFilters}>Limpar tudo</button>}<Link className="game-button" href="/jogos">Explorar jogos <Icon name="arrow-up-right" /></Link></div></div></div>}
      <p className="upcoming-caption library-attribution">Capas: <a href="https://store.steampowered.com/" target="_blank" rel="noreferrer">Steam</a> · <a href="https://www.igdb.com/" target="_blank" rel="noreferrer">IGDB</a></p>
    </main><GamesFooter />
  </LibrarySurface>;
}
