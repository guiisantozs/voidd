import Link from 'next/link';
import Icon from '../Icon';
import Poster from '../Poster';
import { workHref } from '../../lib/work-client';

export default function HomeContinueCard({ item, label, onOpen }) {
  const game = item.categoria === 'jogos', playing = label === 'Jogando', paused = label === 'Pausado';
  const action = playing ? 'Voltar ao jogo' : paused ? 'Retomar jornada' : game ? 'Explorar jogo' : 'Ver filme';
  const status = playing ? 'playing' : paused ? 'paused' : game ? 'want' : 'watchlist';
  return <Link className="void-home-continue-card" data-status={status} href={workHref(item)} onClick={() => onOpen(item)} aria-label={`${action}: ${item.titulo}. Status: ${label}`}>
    <div className="void-home-continue-cover"><Poster item={item} sizes="(max-width:700px) 42vw, (max-width:1050px) 22vw, 210px"/><span className="void-home-continue-arrow" aria-hidden="true"><Icon name="arrow-up-right"/></span></div>
    <div className="void-home-continue-copy"><h3>{item.titulo}</h3><span className="void-home-continue-status"><i aria-hidden="true"/>{label}</span><p className="void-home-continue-kind">{game ? 'Jogo' : 'Filme'}{item.ano && <><span aria-hidden="true"> · </span>{item.ano}</>}</p></div>
  </Link>;
}
