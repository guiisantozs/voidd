import { useEffect, useId, useRef, useState } from 'react';
import Icon from './Icon';
import { gameStatuses, gameStatusKey } from '../lib/library';
import { useLibrary } from '../lib/use-library';
import GameJourneyDates from './games/GameJourneyDates';

export default function GameStatus({ item, library, compact = false, menuOnly = false }) {
  const id = useId();
  const root = useRef(null), trigger = useRef(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const current = gameStatusKey(library.entries[String(item.id)]);
  function change(next) {
    if (library.update(item, next)) {setMessage(next ? 'Status salvo.' : 'Status removido.');if(menuOnly)trigger.current?.focus({preventScroll:true});setOpen(false);}
  }
  useEffect(()=>{
    if(!open)return;
    const close=event=>{if(!root.current?.contains(event.target))setOpen(false);};
    document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);
  },[open]);
  return <><div ref={root} className={`game-status${compact ? ' game-status-compact' : ''}${menuOnly?' gu-status-only':''}`} data-open={open} onPointerEnter={()=>{if(menuOnly&&window.matchMedia('(hover:hover) and (pointer:fine)').matches)setOpen(true);}} onPointerLeave={()=>{if(menuOnly&&!root.current?.contains(document.activeElement))setOpen(false);}} onFocusCapture={()=>{if(menuOnly&&window.matchMedia('(hover:hover) and (pointer:fine)').matches)setOpen(true);}} onBlurCapture={event=>{if(menuOnly&&!event.currentTarget.contains(event.relatedTarget))setOpen(false);}} onClick={event => event.stopPropagation()} onKeyDown={event=>{if(menuOnly&&event.key==='Escape'){event.stopPropagation();trigger.current?.focus();setOpen(false);}}}><label className={menuOnly?'sr-only':undefined} htmlFor={id}>Na minha lista{compact && <span className="sr-only">: {item.titulo}</span>}</label>{menuOnly?<button ref={trigger} id={id} type="button" className="gu-status-trigger" disabled={!library.ready} aria-expanded={open} aria-controls={`${id}-quick`} aria-label={`Status de ${item.titulo}: ${gameStatuses.find(status=>status.key===current)?.label||'Sem status'}`} onClick={()=>setOpen(value=>window.matchMedia('(hover:hover) and (pointer:fine)').matches?true:!value)}><Icon name="list"/>Status</button>:<select id={id} value={current} disabled={!library.ready} onChange={event => {
    const next = event.target.value;
    change(next);
  }}><option value="">Sem status</option>{gameStatuses.map(status => <option key={status.key} value={status.key}>{status.label}</option>)}</select>}{compact && <div id={`${id}-quick`} className="library-quick-status" role="group" aria-label={`Status rápido: ${item.titulo}`}>{[{ key: '', label: 'Sem status' }, ...gameStatuses].map(option => <button type="button" key={option.key} data-status={option.key || 'none'} disabled={!library.ready} aria-pressed={current === option.key} onClick={() => change(option.key)}>{option.label}</button>)}</div>}{!compact && <span role="status">{library.error || message}</span>}{menuOnly&&<span className="sr-only" role="status">{library.error||message}</span>}</div>{!compact && <GameJourneyDates item={item} library={library} />}</>;
}

export function PersonalGameStatus({ item, chips = false }) {
  const library = useLibrary();
  if (!chips) return <GameStatus key={item.id} item={item} library={library} />;
  const current = gameStatusKey(library.entries[String(item.id)]);
  return <div className="gp-status-picker"><div role="group" aria-label="Seu status neste jogo">{gameStatuses.map(status => <button type="button" key={status.key} disabled={!library.ready} aria-pressed={current === status.key} onClick={() => library.update(item, current === status.key ? '' : status.key)}>{status.label}</button>)}</div><GameJourneyDates item={item} library={library} /><p role="status">{library.error || (current ? `Seu status: ${gameStatuses.find(option => option.key === current)?.label}. Salvo na sua biblioteca privada.` : 'Escolha um status para começar sua jornada.')}</p></div>;
}
