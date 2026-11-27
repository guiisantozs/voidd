import { useEffect, useRef, useState } from 'react';
import Icon from '../Icon';
import RecommendedGameCard from './RecommendedGameCard';
import { MovieFailure } from '../movies/MovieUI';
import { useGameRecommendations } from '../../lib/use-game-recommendations';
import { recommendedGames, RECOMMENDED_CARD_COUNT } from '../../lib/game-recommendations';
import { useReleaseMarquee } from '../../lib/use-release-marquee';
import { useGameRecommendationSignals } from '../../lib/use-game-recommendation-signals';

// Speed: MARQUEE_SPEED in use-release-marquee.js; count: game-recommendations.js.
const FILTER_FADE_MS = 320;

export default function RecommendedGames({ platform, excluded, highlightsLoading, library, onViewAll }) {
  const root = useRef(null);
  const [enabled, setEnabled] = useState(false), [message, setMessage] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const signals = useGameRecommendationSignals(enabled);
  const state = useGameRecommendations({ platform, enabled });
  const personal = useGameRecommendations({ platform, enabled: enabled && signals.preferences.genres.length > 0, genre: signals.preferences.genres[0] || 'all' });
  const games = recommendedGames([...state.games, ...(signals.preferences.genres.length ? personal.games : []), ...signals.friendGames], { platform, excluded, preferences: signals.preferences, friends: signals.friends });
  const loading = state.loading || highlightsLoading;
  const marquee = useReleaseMarquee({ enabled: !loading && !state.error && games.length > 0, count: games.length, paused: menuOpen });
  useEffect(() => {
    if (!('IntersectionObserver' in window)) { setEnabled(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setEnabled(true); observer.disconnect(); } }, { rootMargin: '400px' });
    observer.observe(root.current); return () => observer.disconnect();
  }, []);
  // TODO (Steam): restore a separate "Minha biblioteca" section with the user's
  // imported games. Feed their authorized preferences into recommendedGames,
  // keeping rendering independent from Steam/account fetching and private data.
  function renderRecommended(items, duplicate) { return items.map(item => <RecommendedGameCard key={item.id} item={item} library={library} duplicate={duplicate} onMenuChange={setMenuOpen} onMessage={setMessage}/>); }
  return <section ref={root} className="recommended-games m-container" aria-labelledby="recommended-title" style={{ '--recommended-fade': `${FILTER_FADE_MS}ms` }}>
    <div className="upcoming-heading recommended-heading"><div><h2 id="recommended-title"><Icon name="sparkle"/>Jogos recomendados</h2><p>Escolhidos para você</p></div><a className="upcoming-all" href="#game-search-title" onClick={onViewAll}>Ver todos <Icon name="arrow-right"/></a></div>
    <p className="recommended-source">{signals.preferences.genres.length ? 'Jogos recentes parecidos com os que você gostou.' : 'Sucessos recentes bem avaliados, lançados nos últimos três anos.'}</p>
    {loading ? <div className="recommended-skeleton" role="status" aria-label="Carregando jogos recomendados">{Array.from({ length: Math.min(RECOMMENDED_CARD_COUNT, 7) }, (_, index) => <div key={index}><span className="m-skeleton"/><span className="m-skeleton"/></div>)}</div> : state.error ? <MovieFailure message={state.error} retry={state.retry}/> : !games.length ? <p className="m-empty">Nenhuma recomendação disponível para esta plataforma nesta seleção.</p> : <div className="recommended-carousel" key={platform}>
      <button className="recommended-arrow is-prev" type="button" aria-label="Recomendações anteriores" onClick={() => marquee.move(-1)}><Icon name="chevron-left"/></button>
      <div className="recommended-track is-marquee" ref={marquee.viewport} role="region" tabIndex={0} aria-label="Jogos recomendados" {...marquee.events}><div className="recommended-rail" ref={marquee.rail} style={{ '--release-count': games.length }}>{Array.from({ length: Math.max(2, Math.ceil(8 / games.length) + 1) }, (_, copy) => <div key={copy} className="recommended-group" ref={copy === 0 ? marquee.group : null} aria-hidden={copy > 0 ? 'true' : undefined}>{renderRecommended(games, copy > 0)}</div>)}</div></div>
      <button className="recommended-arrow is-next" type="button" aria-label="Próximas recomendações" onClick={() => marquee.move(1)}><Icon name="chevron-right"/></button>
    </div>}
    {state.partial && <p className="recommended-feedback" role="status">Parte da seleção está indisponível. <button type="button" onClick={state.retry}>Tentar novamente</button></p>}
    {signals.socialError && <p className="recommended-feedback" role="status">Sugestões dos amigos indisponíveis. <button type="button" onClick={signals.retrySocial}>Tentar novamente</button></p>}
    <p className="recommended-feedback" role="status">{library.error || message}</p>
    <p className="upcoming-caption">Dados e capas: {[...new Set(state.games.map(g=>g.fonte).filter(Boolean))].map(source=><a key={source} href={source==='IGDB'?'https://www.igdb.com/':'https://rawg.io/'} target="_blank" rel="noreferrer">{source} </a>)}</p>
  </section>;
}
