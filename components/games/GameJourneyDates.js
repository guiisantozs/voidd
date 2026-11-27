import { useState } from 'react';
import { createPortal } from 'react-dom';
import DetailModal from '../movies/DetailModal';
import Icon from '../Icon';
import { formatJourneyDate, journeyDateValue } from '../../lib/game-journey';

export function JourneyDateLabels({ record }) {
  const started = formatJourneyDate(record?.started_at), finished = formatJourneyDate(record?.finished_at);
  if (!started && !finished) return null;
  return <div className="game-journey-labels">{started && <span>Iniciado em <time dateTime={record.started_at}>{started}</time></span>}{finished && <span>Finalizado em <time dateTime={record.finished_at}>{finished}</time></span>}</div>;
}

export default function GameJourneyDates({ item, library, compact = false, showLabels = true }) {
  const record = library.entries[String(item.id)];
  const [editing, setEditing] = useState(false);
  const [dates, setDates] = useState({ started_at: '', finished_at: '' });
  const [message, setMessage] = useState('');
  function edit() {
    setDates({ started_at: journeyDateValue(record?.started_at), finished_at: journeyDateValue(record?.finished_at) });
    setMessage(''); setEditing(true);
  }
  return <div className={`game-journey-dates${compact ? ' is-compact' : ''}`}>
    {showLabels && <JourneyDateLabels record={record} />}
    {record && <button type="button" className="game-journey-edit" onClick={edit} disabled={!library.ready}><Icon name="calendar" />Editar datas<span className="sr-only"> de {item.titulo}</span></button>}
    {message && <p role="status">{message}</p>}
    {editing && createPortal(<DetailModal title={`Datas de ${item.titulo}`} className="game-journey-modal" onClose={() => setEditing(false)}><form onSubmit={event => {
      event.preventDefault();
      const patch = Object.fromEntries(Object.entries(dates).filter(([key, value]) => value !== journeyDateValue(record?.[key])));
      if (library.updateDates(item, patch)) { setEditing(false); setMessage('Datas salvas.'); }
    }}><label>Iniciado em<input type="date" value={dates.started_at} onChange={event => setDates(old => ({ ...old, started_at: event.target.value }))} /></label><label>Finalizado em<input type="date" value={dates.finished_at} onChange={event => setDates(old => ({ ...old, finished_at: event.target.value }))} /></label><p>Deixe em branco as datas que você não lembra.</p>{library.error && <p role="alert">{library.error}</p>}<div className="game-journey-actions"><button type="button" className="game-button-outline" onClick={() => setEditing(false)}>Cancelar</button><button type="submit" className="game-button" disabled={!library.ready}>Salvar datas</button></div></form></DetailModal>, document.body)}
  </div>;
}
