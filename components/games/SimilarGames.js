import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import GameCover from '../GameCover';
import { rememberGame } from '../GameUI';
import { workHref } from '../../lib/work-client';
import Icon from '../Icon';
import {gameOverviewResource} from '../../lib/use-game-overview-data';

export default function SimilarGames({ item }) {
  const track=useRef(null);
  const [edges,setEdges]=useState({start:true,end:false});
  const measure=()=>{const el=track.current;if(el)setEdges({start:el.scrollLeft<2,end:el.scrollLeft+el.clientWidth>=el.scrollWidth-2});};
  const move=direction=>{const el=track.current;if(el)el.scrollBy({left:direction*el.clientWidth*.85,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};
  const [state, setState] = useState({ loading: true }), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setState({ loading: true });
    gameOverviewResource(item.id,'similar',{force:attempt>0})
      .then(data => { if (active) setState({ rows: data.games || [], partial: data.partial }); })
      .catch(() => {
        if (!active) return;
        setState({ rows: [], error: true });
      });
    return () => { active=false; };
  }, [item.id, attempt]);
  useEffect(()=>{measure();const el=track.current;if(!el)return;const observer=new ResizeObserver(measure);observer.observe(el);return()=>observer.disconnect();},[state]);
  return <section className="gp-section" id="jogos-parecidos" aria-labelledby="gp-similar-title"><div className="gp-section-heading"><div><p className="gp-overline">A PRÓXIMA DESCOBERTA</p><h2 id="gp-similar-title">Jogos parecidos</h2></div><Link href="/jogos">Explorar catálogo →</Link></div><p className="gp-subtle">Mesma série, estúdio e características de jogo — com prioridade para estilos específicos.</p>{state.loading ? <p role="status">Buscando novos universos…</p> : <>{(state.error || state.partial) && <p className="gp-subtle" role="status">{state.partial ? 'Parte da seleção não pôde ser carregada.' : 'O catálogo está indisponível.'} <button className="gp-text-button" onClick={() => setAttempt(n => n + 1)}>Tentar novamente</button></p>}{state.rows?.length ? <div className="gp-similar-carousel"><button className="upcoming-arrow upcoming-prev" disabled={edges.start} aria-label="Jogos parecidos anteriores" onClick={()=>move(-1)}><Icon name="chevron-left"/></button><div className="gp-similar-posters" ref={track} tabIndex={0} role="region" aria-label="Jogos parecidos" onScroll={measure}>{state.rows.map(game => <article key={game.id}><Link href={workHref(game)} onClick={() => rememberGame(game)}><div className="gp-similar-cover"><GameCover item={game}/></div><h3>{game.titulo}</h3></Link><p className="gp-subtle">{game.similarityReason}</p></article>)}</div><button className="upcoming-arrow upcoming-next" disabled={edges.end} aria-label="Mais jogos parecidos" onClick={()=>move(1)}><Icon name="chevron-right"/></button></div> : !state.error && <div className="gp-empty"><h3>Uma próxima descoberta espera por você.</h3><p>Ainda não há jogos parecidos disponíveis para esta seleção.</p><Link href="/jogos">Buscar jogos no catálogo</Link></div>}</>}</section>;
}
