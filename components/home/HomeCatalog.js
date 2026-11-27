import HomeContinueCard from './HomeContinueCard';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Icon from '../Icon';
import Poster from '../Poster';
import { useAccount } from '../AccountProvider';
import { formatRating, itemKey, readReviews } from '../../lib/catalog';
import { DATA_EVENT } from '../../lib/account-storage';
import { workHref } from '../../lib/work-client';
import { homeContinue, homeGenres, homeMatches } from '../../lib/home-catalog';
import { useLibrary } from '../../lib/use-library';
import { useMovieRelease } from '../../lib/use-movie-release';
import { MovieListProvider, useMovieList } from '../movies/MovieUI';
import FriendMovieCard from '../movies/FriendMovieCard';
import HomeMotion from './HomeMotion';
import HomeWorlds from './HomeWorlds';
import useHomeData from './useHomeData';

const filters = [['all', 'Para você'], ['filmes', 'Filmes'], ['jogos', 'Jogos'], ['series', 'Séries'], ['animes', 'Animes']];
export function rememberHomeItem(item) {
  const { friends, friend, friendAverage, friendUpdated, voidNote, ...catalogue } = item;
  try { sessionStorage.setItem(`void:item:${itemKey(item)}`, JSON.stringify(catalogue)); } catch { /* Details also resolve by catalogue ID. */ }
}
export function HomeRow({ id, title, subtitle, icon, href, children, kind = '' }) {
  const track = useRef(null);
  function scroll(direction) {
    track.current?.scrollBy({ left: direction * track.current.clientWidth * .85, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  return <HomeMotion><section className={`void-home-row ${kind}`} aria-labelledby={id}>
    <div className="void-home-row-heading"><div><h2 id={id}><Icon name={icon}/>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><div className="void-home-row-actions">{href && <Link href={href}>Ver todos <Icon name="arrow-up-right"/></Link>}<button type="button" aria-label={`Voltar em ${title}`} onClick={() => scroll(-1)}><Icon name="chevron-left"/></button><button type="button" aria-label={`Avançar em ${title}`} onClick={() => scroll(1)}><Icon name="chevron-right"/></button></div></div>
    <div className="void-home-track" ref={track} role="region" tabIndex={0} aria-label={`${title}: navegue horizontalmente`}>{children}</div>
  </section></HomeMotion>;
}
function HomeCard({ item, rank }) {
  const release = useMovieRelease(item), genres = homeGenres(item), games = item.categoria === 'jogos';
  return <article className={`void-home-card${games ? ' is-game' : ''}${rank ? ' is-ranked' : ''}`}>
    {rank && <span className="void-home-rank" aria-label={`Posição ${rank}`}>{rank}</span>}
    <div className="void-home-card-content"><div className="void-home-card-art"><Link href={workHref(item)} aria-label={`Ver detalhes de ${item.titulo}`} onClick={() => rememberHomeItem(item)}><Poster item={item}/></Link>
      <div className="void-home-card-hover">{genres.length > 0 && <p>{genres.join(' / ')}</p>}{release.allowed ? <Link href={{ pathname: '/avaliar', query: { categoria: item.categoria, id: item.id } }} onClick={() => rememberHomeItem(item)}><Icon name="star"/> Avaliar</Link> : <span>Avaliação após a estreia</span>}</div>
    </div><Link className="void-home-card-title" href={workHref(item)} onClick={() => rememberHomeItem(item)}>{item.titulo}</Link><p className="void-home-card-meta"><span>{item.ano || 'Ano a confirmar'}</span><span><Icon name="star"/>{formatRating(item.nota)}<small>/5</small></span></p></div>
  </article>;
}
export function HomeSkeletons({ games = false }) { return <div className={`void-home-skeletons${games ? ' is-game' : ''}`} role="status" aria-label={games ? 'Carregando jogos' : 'Carregando filmes'}>{[1,2,3,4,5,6].map(key => <div key={key} aria-hidden="true"><span/><i/></div>)}</div>; }
export function HomeFailure({ message, retry }) { return <div className="void-home-catalog-notice" role="status"><p>{message}</p><button type="button" onClick={retry}>Tentar novamente <Icon name="refresh"/></button></div>; }

function Catalog({ catalog, load, enabled = true }) {
  const { user } = useAccount(), { saved, ready } = useMovieList(), library = useLibrary(), social = useHomeData(enabled);
  const [category, setCategory] = useState('all'), [query, setQuery] = useState(''), [reviews, setReviews] = useState({}), [storageError, setStorageError] = useState(false);
  const search = useRef(null), catalogRoot = useRef(null);
  useEffect(() => {
    function refresh() { try { setReviews(readReviews()); setStorageError(false); } catch { setStorageError(true); } }
    refresh(); window.addEventListener(DATA_EVENT, refresh); window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(DATA_EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, []);
  useEffect(() => {
    function shortcut(event) {
      const rect = catalogRoot.current?.getBoundingClientRect();
      const editable = event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
      // The existing people shortcut remains active above the catalogue and on every other page.
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing && !editable && rect?.top < innerHeight * .65 && rect.bottom > 0) {
        event.preventDefault(); event.stopImmediatePropagation(); search.current?.focus();
      }
    }
    document.addEventListener('keydown', shortcut, true);
    return () => document.removeEventListener('keydown', shortcut, true);
  }, []);
  const match = item => homeMatches(item, query, category);
  const top = (catalog.filmes?.items || []).slice(0, 10).map((item, index) => ({ item, rank: index + 1 })).filter(({ item }) => match(item));
  const movies = (catalog.filmes?.items || []).filter(match).slice(0, 18), games = (catalog.jogos?.items || []).filter(match).slice(0, 18);
  const resume = user && ready && library.ready ? homeContinue(library.entries, saved).filter(({ item }) => match(item)) : [];
  const friends = social.friends, friendMovies = (friends?.movies || []).filter(match);
  const movieLoading = !catalog.filmes || catalog.filmes.loading, gameLoading = !catalog.jogos || catalog.jogos.loading;
  return <><section className="void-home-catalog" id="catalogo" ref={catalogRoot} aria-labelledby="home-catalog-title">
    <HomeMotion><div className="void-home-catalog-heading"><div><p className="void-home-overline">EXPLORE. DESCUBRA. REGISTRE.</p><h2 id="home-catalog-title">Sua próxima história<br/>está <em>aqui.</em></h2><p>Escolha um universo. Deixe a sua marca.</p></div><label className="void-home-catalog-search"><span>Buscar nos títulos desta página</span><div><Icon name="search"/><input ref={search} type="search" aria-keyshortcuts="/" value={query} onChange={event => setQuery(event.target.value)} placeholder="O que você quer descobrir?"/><kbd aria-hidden="true">/</kbd></div></label></div>
    <div className="void-home-category-bar"><div className="void-home-category-chips" role="group" aria-label="Categorias do catálogo">{filters.map(([key, label]) => ['series','animes'].includes(key)?<Link key={key} href={`/${key}`}>{label}</Link>:<button key={key} type="button" aria-pressed={category === key} onClick={() => setCategory(key)}>{label}</button>)}</div><span>Suas notas, de 0 a 5.</span></div></HomeMotion>
    {storageError && <p className="void-home-catalog-notice" role="status">Não foi possível carregar seus registros neste navegador.</p>}
    {query && <p className="void-home-search-summary" role="status">{movies.length + games.length} títulos encontrados.{!movies.length && !games.length && !movieLoading && !gameLoading && ' Experimente outro título.'}<button type="button" onClick={() => setQuery('')}>Limpar busca</button></p>}
    {category !== 'jogos' && <>
      {movieLoading ? <HomeSkeletons/> : catalog.filmes.error ? <HomeFailure message={catalog.filmes.error} retry={() => load('filmes')}/> : top.length > 0 && <HomeRow id="home-top-title" title="Top 10 da semana" subtitle="Filmes em alta no TMDB, na ordem do catálogo semanal." icon="arrow-up-right" href="/filmes" kind="is-top">{top.map(({ item, rank }) => <HomeCard key={itemKey(item)} item={item} rank={rank}/>)}</HomeRow>}
      <HomeMotion><section className="void-home-friends" aria-label="Avaliações dos amigos">{!user ? <div className="void-home-circle-invite"><Icon name="users"/><div><h2>Boas histórias.<br/>Melhores companhias.</h2><p>Entre para descobrir o que seus amigos estão avaliando.</p></div><Link href="/conta">Encontrar meu círculo <Icon name="arrow-right"/></Link></div> : !friends ? <HomeSkeletons/> : friends.error ? <HomeFailure message="As avaliações dos amigos estão indisponíveis agora." retry={social.retry}/> : friendMovies.length > 0 ? <HomeRow id="home-friends-title" title="O que seus amigos avaliaram" subtitle="As notas e descobertas do seu círculo." icon="users" href="/amigos" kind="is-friends">{friendMovies.map(movie => <FriendMovieCard key={movie.id} movie={movie}/>)}</HomeRow> : !query && <div className="void-home-circle-invite"><Icon name="users"/><div><h2>Seu círculo tem muito para descobrir.</h2><p>As próximas avaliações dos seus amigos aparecerão aqui.</p></div><Link href="/amigos">Ver amigos <Icon name="arrow-right"/></Link></div>}</section></HomeMotion>
      {!movieLoading && !catalog.filmes?.error && movies.length > 0 && <HomeRow id="home-movies-title" title="Para a sua próxima sessão" icon="film" href="/filmes">{movies.map(item => <HomeCard key={itemKey(item)} item={item}/>)}</HomeRow>}
    </>}
    {resume.length > 0 && <HomeRow id="home-continue-title" title="Continue de onde parou" subtitle="Seu backlog e suas jornadas em andamento." icon="clock" kind="is-continue">{resume.map(({ item, label }) => <HomeContinueCard key={itemKey(item)} item={item} label={label} onOpen={rememberHomeItem}/>)}</HomeRow>}
    {category !== 'filmes' && (gameLoading ? <HomeSkeletons games/> : catalog.jogos.error ? <HomeFailure message={catalog.jogos.error} retry={() => load('jogos')}/> : games.length > 0 && <HomeRow id="home-games-title" title="Sua próxima aventura" subtitle="Mundos que continuam com você depois do último checkpoint." icon="gamepad" href="/jogos" kind="is-games">{games.map(item => <HomeCard key={itemKey(item)} item={item}/>)}</HomeRow>)}
  </section>
  {!query && <HomeWorlds social={social} reviews={reviews} library={library.entries} watchlist={saved}/>}
  </>;
}
export default function HomeCatalog(props) { return <MovieListProvider><Catalog {...props}/></MovieListProvider>; }
