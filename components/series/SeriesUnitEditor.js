import {useEffect,useRef,useState} from 'react';
import Icon from '../Icon';
import RatingInput from '../RatingInput';
import ReviewVisibility from '../ReviewVisibility';
import {formatRating} from '../../lib/catalog';
import {parseRating} from '../../lib/ratings';
import {brazilDay} from '../../lib/movie-sections';
import {SERIES_HIGHLIGHTS} from '../../lib/series-review-highlights';

export default function SeriesUnitEditor({form,change,save,mine,editing,setEditing,busy,message,remove,setRemove,user,profile,controller,heading}){
  const dateInput=useRef(null),[toast,setToast]=useState(false),today=brazilDay(),yesterday=brazilDay(new Date(Date.now()-86400000));
  const savedMessage=/salva com sucesso|apagada/.test(message),showSaved=mine&&!editing;
  useEffect(()=>{setToast(savedMessage);if(savedMessage){const timer=setTimeout(()=>setToast(false),4000);return()=>clearTimeout(timer);}},[message,savedMessage]);
  function pickDate(){dateInput.current?.focus();try{dateInput.current?.showPicker?.();}catch{/* The focused native date control remains available. */}}
  function highlight(key){const before=form.highlights||[];change('highlights',before.includes(key)?before.filter(value=>value!==key):[...before,key]);}
  return <section className="sd-unit-editor"><form className="sd-unit-form" onSubmit={event=>{event.preventDefault();if(!showSaved)save();}}>
    <div className="sd-editor-body">{heading}
      {showSaved?<div className="sd-saved-review"><p className="sd-saved-score"><Icon name="star"/>{formatRating(mine.nota)}<small>/ 5</small></p><p className="sd-review-meta">Assistido em {mine.data?.split('-').reverse().join('/')} · {mine.public?'Pública':'Privada'}</p>
        {!!mine.highlights?.length&&<div className="sd-highlight-chips">{mine.highlights.map(key=><span key={key}>{SERIES_HIGHLIGHTS.find(row=>row[0]===key)?.[1]||key}</span>)}</div>}
        {mine.spoiler?<details><summary>Mostrar sua review com spoilers</summary><p className="md-review-text">{mine.texto||'Sem comentário.'}</p></details>:<p className="md-review-text">{mine.texto||'Você registrou uma nota sem comentário.'}</p>}
        {remove&&<div className="md-inline-confirm"><p>Apagar sua avaliação e removê-la da comunidade?</p><button type="button" disabled={busy} onClick={()=>save(true)}>Sim, apagar</button><button type="button" onClick={()=>setRemove(false)}>Cancelar</button></div>}
      </div>:<fieldset className="sd-editor-fields" disabled={busy}>
        <RatingInput variant="stars" value={form.rating} onChange={value=>change('rating',value)}/>
        <div className="sd-date-section"><label htmlFor="sd-unit-date"><Icon name="clock"/> Quando assistiu?</label><input ref={dateInput} id="sd-unit-date" type="date" required min={controller.airDate||undefined} max={today} value={form.date} onChange={event=>change('date',event.target.value)}/><div className="sd-date-shortcuts"><button type="button" aria-pressed={form.date===today} onClick={()=>change('date',today)}>Hoje</button><button type="button" disabled={!!controller.airDate&&yesterday<controller.airDate} aria-pressed={form.date===yesterday} onClick={()=>change('date',yesterday)}>Ontem</button><button type="button" onClick={pickDate}>Outra data <Icon name="calendar"/></button></div></div>
        <fieldset className="sd-highlights"><legend>O que se destacou? <small>opcional</small></legend><div className="sd-highlight-chips">{SERIES_HIGHLIGHTS.map(([key,label])=><button type="button" key={key} disabled={!controller.highlightsAvailable} aria-pressed={(form.highlights||[]).includes(key)} onClick={()=>highlight(key)}>{label}</button>)}</div>{!controller.highlightsAvailable&&<p className="sd-help">Os destaques ainda não estão disponíveis. Você pode salvar sua nota e review normalmente.</p>}</fieldset>
        <label className="md-editor-copy"><span>Sua review <small>opcional</small></span><textarea maxLength={2000} rows={5} value={form.text} onChange={event=>change('text',event.target.value)} placeholder="O que ficou com você depois dos créditos?"/><small className="md-editor-count">{form.text.length}/2000</small></label>
        <label className="sd-switch"><input type="checkbox" role="switch" checked={form.spoiler} onChange={event=>change('spoiler',event.target.checked)}/><span>Contém spoiler</span></label>
        <ReviewVisibility switchControl user={user} profile={profile} isPublic={form.public} onChange={value=>change('public',value)}/>
      </fieldset>}
      {message&&!savedMessage&&<p className="sd-form-feedback" role="status">{message}</p>}
    </div>
    <div className="sd-editor-footer"><p><Icon name={form.public?'globe':'lock'}/>{form.public?'Pública com a identidade do seu perfil.':'Só você pode ver esta avaliação.'}</p><div>{showSaved?<><button type="button" className="sd-secondary" disabled={busy} onClick={()=>setRemove(true)}>Apagar</button><button key="edit" type="button" className="sd-primary" disabled={busy} onClick={event=>{event.preventDefault();setEditing(true);}}>Editar avaliação</button></>:<>{mine&&<button type="button" className="sd-secondary" disabled={busy} onClick={event=>{event.preventDefault();setEditing(false);}}>Cancelar</button>}<button key="save" type="submit" className="sd-primary" disabled={busy||!Number.isFinite(parseRating(form.rating))} aria-busy={busy}>{busy?'Salvando…':'Salvar avaliação'}<Icon name="arrow-up-right"/></button></>}</div></div>
  </form>{toast&&<div className="sd-save-toast" role="status"><Icon name="check"/>{message}</div>}</section>;
}
