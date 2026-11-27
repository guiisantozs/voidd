import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState } from 'react';
import Icon from '../Icon';
import GameCover from '../GameCover';
import { rememberGame } from '../GameUI';
import GamePlatformIcons from './GamePlatformIcons';
import { gameStatusKey, gameStatuses } from '../../lib/library';
import { formatRating } from '../../lib/catalog';
import { workHref } from '../../lib/work-client';

function StatusMenu({ trigger, current, title, onChoose, onClose }) {
  const menu = useRef(null), id = useId();
  const rect = trigger.current.getBoundingClientRect();
  const width = Math.min(240, window.innerWidth - 24);
  const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
  const roomBelow = window.innerHeight - rect.bottom;
  const top = Math.max(12, roomBelow > 340 ? rect.bottom + 8 : rect.top - 340);
  useEffect(() => {
    (menu.current?.querySelector('[aria-pressed="true"]') || menu.current?.querySelector('button'))?.focus({ preventScroll: true });
    const outside = event => { if (!menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) onClose(false); };
    const scroll = event => {
      if (menu.current?.contains(event.target)) return;
      const next = trigger.current?.getBoundingClientRect();
      if (!next || Math.abs(next.top - rect.top) > 1 || Math.abs(next.left - rect.left) > 1) onClose(false);
    };
    const close = () => onClose(false);
    const wheel = event => { if (!menu.current?.contains(event.target)) onClose(false); };
    document.addEventListener('pointerdown', outside); window.addEventListener('resize', close); window.addEventListener('scroll', scroll, true); document.addEventListener('wheel', wheel, { passive: true });
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', close); window.removeEventListener('scroll', scroll, true); document.removeEventListener('wheel', wheel); };
  }, []);
  return createPortal(<div ref={menu} role="dialog" aria-labelledby={id} className="recommended-status-menu" style={{ left, width, top }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) onClose(false); }}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(true); } }}>
    <p id={id}>Minha lista <span>{title}</span></p><div role="group" aria-label="Escolher status">{gameStatuses.map(status => <button type="button" key={status.key} aria-pressed={current === status.key} onClick={() => onChoose(status.key)}>{status.label}{current === status.key && <Icon name="check"/>}</button>)}{current && <button type="button" onClick={() => onChoose('')}>Remover da biblioteca</button>}</div>
  </div>, document.body);
}

export default function RecommendedGameCard({ item, library, onMessage, duplicate = false, onMenuChange }) {
  // Personal/social explanations belong to this UI, never to cached catalogue facts.
  const { recommendationReason, recommendationScore, ...catalogItem } = item;
  const [open, setOpen] = useState(false), trigger = useRef(null);
  const current = gameStatusKey(library.entries[String(item.id)]);
  useEffect(() => { if (open) onMenuChange(true); return () => { if (open) onMenuChange(false); }; }, [open, onMenuChange]);
  function close(restore) { setOpen(false); if (restore) trigger.current?.focus({ preventScroll: true }); }
  return <article data-marquee-card className={`recommended-card${open ? ' is-menu-open' : ''}`}>
    <div className="recommended-art"><Link tabIndex={duplicate?-1:undefined} href={workHref(item)} className="recommended-cover-link" aria-label={`Ver detalhes de ${item.titulo}`} onClick={() => rememberGame(catalogItem)}><GameCover item={item}/><div className="recommended-overlay"><p>{Number.isFinite(item.nota) && <span><Icon name="star"/> {item.fonte || 'RAWG'} {formatRating(item.nota)} / 5</span>}{item.ano && <span>{item.ano}</span>}</p>{item.generos?.length > 0 && <p>{item.generos.slice(0, 3).join(' · ')}</p>}{item.recommendationReason && <p className="recommended-reason">{item.recommendationReason}</p>}<GamePlatformIcons item={item}/></div></Link>
      {item.generos?.[0] && <span className="recommended-genre">{item.generos[0]}</span>}
      <button tabIndex={duplicate?-1:undefined} ref={trigger} type="button" className="recommended-add" disabled={!library.ready} aria-label={`Alterar minha lista: ${item.titulo}`} aria-expanded={open} aria-haspopup="dialog" title={current ? 'Alterar status na minha lista' : 'Adicionar à minha lista'} onClick={() => setOpen(value => !value)}><Icon name={current ? 'check' : 'plus'}/></button>
    </div>
    <h3><Link tabIndex={duplicate?-1:undefined} href={workHref(item)} onClick={() => rememberGame(catalogItem)}>{item.titulo}</Link></h3>
    {open && <StatusMenu trigger={trigger} current={current} title={item.titulo} onClose={close} onChoose={status => { if (library.update(catalogItem, status)) { onMessage(status ? `${item.titulo}: ${gameStatuses.find(option => option.key === status).label}.` : `${item.titulo} removido da biblioteca.`); close(true); } }}/>}
  </article>;
}
