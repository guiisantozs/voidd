import { useEffect, useId, useRef, useState } from 'react';
import Icon from '../Icon';
import { libraryFilters } from '../../lib/game-library-view';
import { libraryPlatforms, libraryOrders } from '../../lib/game-library-filters';

function TextFilter({ label, value, onChange, year = false }) {
  const [draft, setDraft] = useState(value);
  const change = useRef(onChange); change.current = onChange;
  const submitted = useRef(new Set());
  function publish(next) {
    submitted.current.add(next);
    if (submitted.current.size > 8) submitted.current.delete(submitted.current.values().next().value);
    change.current(next);
  }
  useEffect(() => {
    // A completed shallow route acknowledges a submitted value. It must not
    // overwrite characters typed since that request started. Back/forward and
    // externally changed filters still replace the local input as before.
    if (submitted.current.has(value)) submitted.current.delete(value);
    else setDraft(value);
  }, [value]);
  useEffect(() => {
    if (year || draft === value) return;
    const timer = setTimeout(() => publish(draft), 350);
    return () => clearTimeout(timer);
  }, [draft, value, year]);
  function commit() {
    if (year && draft && !/^[1-9]\d{3}$/.test(draft)) { setDraft(value); return; }
    if (draft !== value) publish(draft);
  }
  return <label className={year ? 'library-year-field' : 'library-search-field'}>{label}<span className="library-field-control">{!year && <Icon name="search" />}<input type={year ? 'number' : 'search'} min={year ? '1000' : undefined} max={year ? '9999' : undefined} step={year ? '1' : undefined} placeholder={year ? 'Qualquer ano' : 'Nome do jogo'} maxLength={year ? undefined : 200} value={draft}
    onChange={event => { const next = event.target.value; setDraft(next); if (year && (!next || /^[1-9]\d{3}$/.test(next))) publish(next); }}
    onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(); } }} /></span></label>;
}

function MinimumRating({ value, onChange }) {
  const name = useId();
  const rating = value === '' ? 0 : Number(value);
  return <fieldset className="library-minimum-rating"><legend>Nota mínima</legend><div className="library-star-controls">
    <label className="library-rating-zero"><input type="radio" name={name} value="0" checked={value === '0'} onChange={() => onChange('0')} /><span aria-hidden="true">0</span><span className="sr-only">Nota mínima zero de 5</span></label>
    <div className="library-filter-stars">{[1, 2, 3, 4, 5].map(star => <span className="library-filter-star" key={star}><Icon name="star" /><span className="library-filter-star-fill" style={{ width: `${Math.max(0, Math.min(1, rating - star + 1)) * 24}px` }}><Icon name="star" /></span>{[star - .5, star].map((score, index) => <label className={index ? 'library-star-right' : 'library-star-left'} key={score}><input type="radio" name={name} value={score} checked={value === String(score)} onChange={() => onChange(String(score))} /><span className="sr-only">Nota mínima {score.toLocaleString('pt-BR')} de 5</span></label>)}</span>)}</div>
    <output className="library-minimum-value">{value === '' ? 'Qualquer nota' : `${rating.toLocaleString('pt-BR')} / 5`}</output>
    <button type="button" className="library-rating-clear" disabled={value === ''} aria-label="Remover filtro de nota mínima" onClick={() => onChange('')}><Icon name="close" /></button>
  </div></fieldset>;
}

function Fields({ filters, genres, update }) {
  return <div className="library-filter-fields">
    <TextFilter label="Buscar na biblioteca" value={filters.q} onChange={q => update({ q })} />
    <label>Status<select value={filters.status} onChange={event => update({ status: event.target.value })}>{libraryFilters.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
    <label>Plataforma<select value={filters.platform} onChange={event => update({ platform: event.target.value })}><option value="">Todas</option>{libraryPlatforms.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
    <label>Gênero<select value={filters.genre} onChange={event => update({ genre: event.target.value })}><option value="">Todos</option>{filters.genre && !genres.some(option => option.key === filters.genre) && <option value={filters.genre} disabled>{filters.genre} (fora da biblioteca)</option>}{genres.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
    <label className="library-order-field">Ordenar<select value={filters.order} onChange={event => update({ order: event.target.value })}>{libraryOrders.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
    <TextFilter label="Ano: de" value={filters.yearFrom} year onChange={yearFrom => update({ yearFrom })} />
    <TextFilter label="Ano: até" value={filters.yearTo} year onChange={yearTo => update({ yearTo })} />
    <MinimumRating value={filters.minRating} onChange={minRating => update({ minRating })} />
  </div>;
}

export default function LibraryFilters({ filters, genres, chips, update, clear,view='covers',onView }) {
  const dialog = useRef(null);
  const button = useRef(null);
  const dialogId = useId();
  const [open, setOpen] = useState(false);
  function close() { dialog.current?.close(); }
  return <section className="library-filter-bar" aria-label="Filtros da biblioteca">
    <div className="library-filter-toolbar">
      <TextFilter label="Buscar na biblioteca" value={filters.q} onChange={q=>update({q})}/>
      <label className="library-toolbar-platform">Plataforma<select value={filters.platform} onChange={event=>update({platform:event.target.value})}><option value="">Todas</option>{libraryPlatforms.map(option=><option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
      <label className="library-toolbar-order">Ordenar<select value={filters.order} onChange={event=>update({order:event.target.value})}>{libraryOrders.map(option=><option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
      <button ref={button} type="button" className="library-filter-toggle library-search-trigger game-button-outline" aria-haspopup="dialog" aria-controls={dialogId} aria-expanded={open} onClick={() => { dialog.current.showModal(); setOpen(true); dialog.current.querySelector('input[type="search"]')?.focus({ preventScroll: true }); }}><Icon name="list" /><span className="library-search-trigger-label">Mais filtros</span>{chips.length > 0 && <span className="library-search-trigger-count" aria-label={`${chips.length} filtros ativos`}>{chips.length}</span>}</button>
      {onView&&<div className="library-view-toggle" role="group" aria-label="Visualização da biblioteca"><button type="button" aria-pressed={view==='covers'} aria-label="Visão de capas" onClick={()=>onView('covers')}><Icon name="grid"/></button><button type="button" aria-pressed={view==='compact'} aria-label="Lista compacta" onClick={()=>onView('compact')}><Icon name="list"/></button></div>}
    </div>
    <dialog id={dialogId} ref={dialog} className="library-filter-drawer library-search-dialog" aria-label="Pesquisar jogos na biblioteca" onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    }} onClose={() => { setOpen(false); button.current?.focus(); }}>
      <header><div className="library-search-dialog-heading"><span className="library-search-dialog-icon" aria-hidden="true"><Icon name="search" /></span><div><h2>Pesquisar jogos</h2><p>Combine busca e filtros da sua biblioteca.</p></div></div><button type="button" aria-label="Fechar filtros" onClick={close}><Icon name="close" /></button></header>
      <div className="library-search-dialog-body"><Fields filters={filters} genres={genres} update={update} />
        {filters.yearFrom && filters.yearTo && Number(filters.yearFrom) > Number(filters.yearTo) && <p className="library-filter-warning" role="status">O ano inicial está depois do ano final. Ajuste a faixa para encontrar jogos.</p>}
      </div>
      <footer><button type="button" className="game-button-outline" disabled={!chips.length && filters.order === 'popular'} onClick={clear}>Limpar tudo</button><button type="button" className="game-button" onClick={close}>Ver resultados<Icon name="arrow-right" /></button></footer>
    </dialog>
    {chips.length > 0 && <div className="library-active-filters" aria-label="Filtros ativos">{chips.map(chip => <button type="button" key={chip.key} onClick={() => update({ [chip.key]: '' })} aria-label={`Remover filtro: ${chip.label}`}>{chip.label}<Icon name="close" /></button>)}</div>}
  </section>;
}
