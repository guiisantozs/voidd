import { useRef } from 'react';
import Icon,{RatingStars} from '../Icon';
import { LibraryNumber, libraryStatusIcons } from './LibraryVisuals';
import {libraryFilters} from '../../lib/game-library-view';

// Use the same scroll-snap track and arrow controls as the film shelves.
export function LibraryRow({ id, title, count, status, onViewAll, className = '', children }) {
  const track = useRef(null);
  function move(direction) {
    const element = track.current;
    if (!element) return;
    element.scrollBy({ left: direction * element.clientWidth * .85, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  return <section className={`m-poster-section library-shelf ${count<4?'library-shelf--small':''} ${className}`} style={{'--library-shelf-count':count}} data-status={status} aria-labelledby={`${id}-title`}>
    <div className="library-shelf-heading"><h2 id={`${id}-title`}><Icon name={libraryStatusIcons[status] || 'gamepad'} />{title} <span>{count}</span></h2>
      {onViewAll && <button type="button" className="library-view-all" onClick={onViewAll}>Ver todos <Icon name="arrow-right" /></button>}
    </div>
    <div className="m-row-container">
      {count > 1 && <button type="button" className="m-row-arrow m-row-prev" aria-label={`Voltar em ${title}`} onClick={() => move(-1)}><Icon name="chevron-left" /></button>}
      <div id={id} className="m-poster-track library-shelf-track" ref={track} role="region" aria-label={title} tabIndex={0}>{children}</div>
      {count > 1 && <button type="button" className="m-row-arrow m-row-next" aria-label={`Avançar em ${title}`} onClick={() => move(1)}><Icon name="chevron-right" /></button>}
    </div>
  </section>;
}

export default function LibraryOverview({counts,summary,ready}) {
  const segments=libraryFilters.filter(option=>option.key!=='all'&&counts[option.key]>0);
  const numbers=[['Total de jogos',counts.all,'all'],['Finalizados',counts.finished,'finished'],['Platinados',counts.platinum,'platinum']];
  return <section className="library-overview library-overview-v2" aria-label="Resumo da biblioteca" aria-busy={!ready}>
    <div className="overview-progress-block">
      <div className="overview-progress-top"><p>PROGRESSO DA BIBLIOTECA</p><span className={`overview-now-badge${ready&&counts.playing_now>0?' is-playing':''}`}><i aria-hidden="true"/>Jogando agora: {ready?counts.playing_now:'—'}</span></div>
      <div className="overview-progress-figure"><strong><LibraryNumber value={summary.percent} ready={ready}/><small>%</small></strong><p>{ready?`${summary.completed} de ${counts.all} jogos concluídos`:'Carregando progresso...'}</p></div>
      <div className="overview-progress-track" role="progressbar" aria-label="Biblioteca concluída" aria-valuemin={0} aria-valuemax={100} aria-valuenow={ready?summary.percent:undefined} aria-valuetext={ready?`${summary.completed} de ${counts.all} jogos concluídos`:'Carregando'}>
        {ready&&<div className="overview-progress-segments">{segments.map(option=><span className="overview-progress-segment" data-status={option.key} key={option.key} style={{flexGrow:counts[option.key]}} title={`${option.label}: ${counts[option.key]}`} aria-hidden="true"/>)}</div>}
      </div>
      {ready&&segments.length>0&&<ul className="overview-progress-legend" aria-label="Distribuição dos jogos por status">{segments.map(option=><li data-status={option.key} key={option.key}><i aria-hidden="true"/><span>{option.label}</span><strong>{counts[option.key]}</strong></li>)}</ul>}
      {ready&&counts.all===0&&<p className="overview-no-games">Nenhum jogo na biblioteca ainda.</p>}
    </div>
    <dl className="overview-stat-grid">{numbers.map(([label,value,status])=><div className="overview-stat-tile" data-status={status} key={status}><dt>{label}</dt><dd><LibraryNumber value={value} ready={ready}/></dd></div>)}
      <div className="overview-stat-tile overview-stat-rating" data-status="all"><dt>Nota média dada</dt><dd><LibraryNumber value={summary.average} ready={ready} rating unit={false}/><small>/5</small></dd><RatingStars value={ready?summary.average:0}/><p>{ready?(summary.rated?`${summary.rated} ${summary.rated===1?'avaliação dada':'avaliações dadas'}`:'Nenhuma avaliação dada'):'Carregando...'}</p></div>
    </dl>
  </section>;
}
