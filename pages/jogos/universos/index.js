import Link from 'next/link';
import Icon from '../../../components/Icon';
import GameUniverseShell from '../../../components/games/GameUniverseShell';
import UniverseLogo from '../../../components/universes/UniverseLogo';
import { gameUniverses } from '../../../game-universes.config';
import { useUniverseResource } from '../../../components/universes/UniverseUI';

export default function GameUniverses() {
  const state=useUniverseResource('/api/game-universes');
  return <GameUniverseShell title="Universos de jogos"><main className="m-container u-catalog gu-catalog">
    <header className="gu-catalog-header"><p className="m-eyebrow">CADA JOGO ABRE UM UNIVERSO</p><h1>Grandes mundos.<br /><span>Novas histórias para viver.</span></h1>
    <p className="u-lead">Revisite suas franquias favoritas e descubra por onde continuar. Escolha um universo para explorar seus jogos.</p>
    </header>{(state.error||state.data?.universes.some(row=>row.error))&&<p className="game-notice" role="status">Algumas contagens estão indisponíveis agora. Você ainda pode explorar os universos. <button type="button" onClick={state.retry}>Tentar novamente</button></p>}
    <div className="u-universe-grid gu-universe-grid">{gameUniverses.map(universe => {
      const data=state.data?.universes.find(row=>row.slug===universe.slug);
      return <article className="u-universe-card gu-universe-card" style={{ '--universe-accent': universe.accent }} key={universe.slug}>
      <Link href={`/jogos/universos/${universe.slug}`}>{data?.backdrop&&<img className="gu-index-backdrop" src={data.backdrop} alt="" loading="lazy" decoding="async"/>}<span className="gu-universe-logo" aria-hidden="true"><UniverseLogo logo={universe.logo} /></span><div className="u-universe-card-copy"><h2>{universe.nome}</h2><p>{universe.descricao}</p><div className="gu-index-facts" aria-live="polite"><span>{data?.total??'—'} jogos oficiais</span><span>{data?.facts?.firstYear?`Desde ${data.facts.firstYear}`:'Explorar a história'}</span></div><span className="gu-explore">Explorar universo <Icon name="arrow-up-right" /></span></div></Link>
    </article>})}</div>
    <Link className="gu-back" href="/jogos"><Icon name="arrow-left" />Voltar para jogos</Link>
  </main></GameUniverseShell>;
}
