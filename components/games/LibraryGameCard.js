import Link from 'next/link';
import {useEffect,useId,useRef,useState} from 'react';
import Icon from '../Icon';
import GameCover from '../GameCover';
import GameStatus from '../GameStatus';
import {rememberGame} from '../GameUI';
import GamePlatformIcons from './GamePlatformIcons';
import GameJourneyDates,{JourneyDateLabels} from './GameJourneyDates';
import {workHref} from '../../lib/work-client';
import {gameReviewHref} from '../../lib/game-review-navigation';
import {libraryFilters} from '../../lib/game-library-view';
import {formatRating} from '../../lib/catalog';

export default function LibraryGameCard({item,current,rating,library,highlighted=false,showBadge=false}){
  const [open,setOpen]=useState(false),root=useRef(null),trigger=useRef(null),id=useId();
  const reviewed=Number.isFinite(rating),label=libraryFilters.find(option=>option.key===current)?.label||'Sem status';
  useEffect(()=>{if(!open)return;const close=event=>{if(!root.current?.contains(event.target))setOpen(false);};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[open]);
  return <article ref={root} className={`upcoming-cover-card library-cover-card library-hud-card${highlighted?' library-playing-card':''}`} data-status={current} data-actions-open={open} onKeyDown={event=>{if(event.key==='Escape'&&open){event.stopPropagation();setOpen(false);trigger.current?.focus();}}}>
    <div className="library-art-wrapper" onPointerEnter={event=>{if(event.pointerType==='mouse'&&window.matchMedia('(hover:hover) and (pointer:fine)').matches)setOpen(true);}} onPointerLeave={()=>{if(!root.current?.contains(document.activeElement))setOpen(false);}}>
      <Link className="upcoming-cover-link" href={workHref(item)} onClick={()=>rememberGame(item)} aria-label={`Abrir ${item.titulo}`}><div className="upcoming-art"><GameCover item={item}/>
        {showBadge&&<span className="library-cover-badge"><span className="library-status-dot" aria-hidden="true"/>{label}</span>}
        {current==='finished'&&<span className="library-finished-mark" aria-label="Concluído"><Icon name="check"/></span>}
        {reviewed&&<span className="library-cover-rating" aria-label={`Sua nota: ${formatRating(rating)} de 5`}><Icon name="star"/>{formatRating(rating)}<small>/5</small></span>}
        <div className="game-cover-platforms"><GamePlatformIcons item={item}/></div>
      </div></Link>
      <div className="library-card-actions"><button ref={trigger} className="library-actions-trigger" type="button" aria-label={`Ações de ${item.titulo}`} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)}><Icon name={open?'close':'more'}/></button>
        <div id={id} className="library-action-panel" hidden={!open}>
          <GameStatus item={item} library={library} compact/>
          <GameJourneyDates item={item} library={library} compact showLabels={false}/>
          <Link className="library-panel-review" href={gameReviewHref(item.id,reviewed)} onClick={()=>rememberGame(item)}><Icon name="edit"/>{reviewed?'Editar nota':'Avaliar'}</Link>
          <button type="button" disabled={!library.ready||current==='none'} onClick={()=>library.update(item,'')} aria-label={`Remover status de ${item.titulo}`}><Icon name="minus"/>Remover</button>
          {current==='none'&&<span className="library-action-note">A avaliação continua no Void. Você pode editá-la em Avaliar.</span>}
        </div>
      </div>
    </div>
    <Link className="library-title-link" href={workHref(item)} onClick={()=>rememberGame(item)}><h3>{item.titulo}</h3></Link>
    <p className="library-cover-year">{item.ano||'Ano não informado'}</p>
    <div className="library-journey-meta"><JourneyDateLabels record={library.entries[String(item.id)]}/></div>
    {highlighted&&<><p className="library-playing-platforms">{item.plataformas?.join(' · ')||'Plataformas não informadas'}</p><div className="library-playing-actions"><button type="button" disabled={!library.ready} onClick={()=>library.update(item,'finished')}><Icon name="check"/>Finalizar</button><button type="button" disabled={!library.ready} onClick={()=>library.update(item,'paused')}><Icon name="pause"/>Pausar</button><Link href={gameReviewHref(item.id,reviewed)} onClick={()=>rememberGame(item)}><Icon name="edit"/>Avaliar</Link></div></>}
  </article>;
}
