import Link from 'next/link';
import { useState } from 'react';
import UpcomingGames from './UpcomingGames';
import GameCover from './GameCover';
import Icon from './Icon';
import { GameCard, GameImage, rememberGame } from './GameUI';
import { MovieFailure } from './movies/MovieUI';
import { gameGenres } from '../lib/game-filters';
import { workHref } from '../lib/work-client';
import { releaseLabel } from '../lib/movie-sections';

export function GameDiscoverySearch({ query, setQuery, genre, setGenre, year, setYear, onSearch, children }) {
  return <section className="m-search m-container game-discovery-search" aria-labelledby="game-search-title"><div className="m-section-title"><span aria-hidden="true"><Icon name="search" /></span><h2 id="game-search-title">Encontre seu próximo jogo</h2><span className="m-section-line" /></div><form className="m-search-controls" onSubmit={event => { event.preventDefault(); onSearch?.(); }}><div><label htmlFor="game-query">Título do jogo</label><input id="game-query" type="search" maxLength={100} value={query} onChange={event => setQuery(event.target.value)} placeholder="Busque por título…" /></div><div><label htmlFor="game-genre">Gênero</label><select id="game-genre" value={genre} onChange={event => setGenre(event.target.value)}><option value="all">Todos os gêneros</option>{gameGenres.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}</select></div><div><label htmlFor="game-year">Ano</label><input id="game-year" type="number" min="1950" max="2099" step="1" value={year} onChange={event => setYear(event.target.value)} placeholder="Todos" /></div><button type="submit">Buscar</button></form>{children}</section>;
}

export function GameReleases(props) {
  return props.upcoming||props.mode==='trending' ? <UpcomingGames {...props}/> : <RecentGames {...props}/>;
}
function RecentGames({ state, retry, upcoming = false, library, reviews }) {
  const [expanded, setExpanded] = useState(false);
  const title = upcoming ? 'Próximos lançamentos' : 'Lançamentos recentes';
  const id = upcoming ? 'game-upcoming' : 'game-recent';
  const games = state?.games || [];
  return <section className="game-releases m-container" aria-labelledby={id}><div className="m-section-title"><span aria-hidden="true"><Icon name={upcoming ? 'clock' : 'gamepad'} /></span><h2 id={id}>{title}</h2><span className="m-section-line" /></div>{state?.loading ? <div className="m-now-grid" role="status" aria-label={`Carregando ${title.toLowerCase()}`}>{Array.from({ length: 6 }, (_, i) => <div className="m-now-skeleton" key={i}><span className="m-skeleton" /><div><span className="m-skeleton" /><span className="m-skeleton" /></div></div>)}</div> : state?.error ? <MovieFailure message={state.error} retry={retry} /> : !games.length ? <p className="m-empty">Nenhum lançamento disponível nesta seleção.</p> : upcoming ? <div className="games-editorial-track" tabIndex={0} role="region" aria-label={title}>{games.map(item => <div className="game-upcoming-card" key={item.id}><GameCard item={item} library={library} review={reviews?.[`jogos:${item.id}`]} /><time dateTime={item.estreia}>{releaseLabel(item.estreia)}</time></div>)}</div> : <><div className="m-now-grid">{games.slice(0, expanded ? undefined : 6).map(item => <Link className="m-now-item" key={item.id} href={workHref(item)} onClick={() => rememberGame(item)}><GameCover item={item}/><div><h3>{item.titulo}</h3><time dateTime={item.estreia}>{releaseLabel(item.estreia)}</time></div><span aria-hidden="true"><Icon name="arrow-up-right" /></span></Link>)}</div>{games.length > 6 && <button className="m-see-all" type="button" onClick={() => setExpanded(value => !value)}>{expanded ? 'Mostrar menos' : 'Ver todos os lançamentos recentes'} <Icon name={expanded ? 'arrow-up' : 'arrow-right'} /></button>}</>}</section>;
}
