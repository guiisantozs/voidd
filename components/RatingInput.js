import { useId, useState } from 'react';
import Icon, { RatingStars } from './Icon';
import { parseRating } from '../lib/ratings';
import { formatRating } from '../lib/catalog';

function StarRatingInput({value,onChange}){
  const id=useId(),rating=parseRating(value),[hover,setHover]=useState(null),[exact,setExact]=useState(false);
  const shown=hover??(Number.isFinite(rating)?rating:0);
  function pointerValue(event){const box=event.currentTarget.getBoundingClientRect();return Math.min(5,Math.max(.5,Math.ceil((event.clientX-box.left)/box.width*10)/2));}
  function keys(event){const current=Number.isFinite(rating)?rating:0;const next=event.key==='Home'?0:event.key==='End'?5:['ArrowRight','ArrowUp'].includes(event.key)?Math.min(5,current+.5):['ArrowLeft','ArrowDown'].includes(event.key)?Math.max(0,current-.5):null;if(next===null)return;event.preventDefault();onChange(String(next));}
  return <fieldset className="void-rating-input sd-star-input"><legend>Sua nota <span aria-hidden="true">*</span></legend>
    <div className="sd-star-line"><div className="sd-star-picker" role="slider" tabIndex={0} aria-label="Sua nota. Use as setas para ajustar de meia em meia estrela" aria-valuemin={0} aria-valuemax={5} aria-valuenow={Number.isFinite(rating)?rating:0} aria-valuetext={Number.isFinite(rating)?`${formatRating(rating)} de 5`:'Nenhuma nota escolhida'} onKeyDown={keys} onPointerMove={event=>setHover(pointerValue(event))} onPointerLeave={()=>setHover(null)} onClick={event=>onChange(String(pointerValue(event)))}><RatingStars value={shown}/></div><strong className="sd-rating-number">{Number.isFinite(rating)?formatRating(rating):'—'}<small>/ 5</small></strong></div>
    <div className="sd-rating-links"><button type="button" aria-expanded={exact} aria-controls={`${id}-exact`} onClick={()=>setExact(old=>!old)}>Digitar nota exata</button><button type="button" onClick={()=>onChange('0')}>Dar nota zero</button></div>
    {exact&&<div className="void-rating-exact" id={`${id}-exact`}><label htmlFor={`${id}-value`}>Nota exata</label><input autoFocus id={`${id}-value`} type="text" inputMode="decimal" maxLength={3} value={value} aria-invalid={value!==''&&!Number.isFinite(rating)||undefined} onChange={event=>onChange(event.target.value)} aria-describedby={`${id}-hint`}/><span>/ 5</span></div>}
    <p id={`${id}-hint`}>De 0 a 5. Nas estrelas, passos de 0,5; na nota exata, uma casa decimal.</p>
  </fieldset>;
}

export default function RatingInput({ value, onChange, variant }) {
  const id = useId();
  const rating = parseRating(value);
  if(variant==='stars')return <StarRatingInput value={value} onChange={onChange}/>;
  return <fieldset className="void-rating-input"><legend>Sua nota</legend>
    <div className="void-rating-value"><span aria-hidden="true"><RatingStars value={Number.isFinite(rating) ? rating : 0}/></span><strong>{formatRating(rating)} <small>/ 5</small></strong></div>
    <label htmlFor={`${id}-slider`} className="sr-only">Ajustar sua nota de 0 a 5</label>
    <input id={`${id}-slider`} type="range" min="0" max="5" step="0.1" value={Number.isFinite(rating) ? rating : 0} aria-valuetext={Number.isFinite(rating) ? `${formatRating(rating)} de 5` : 'Escolha uma nota'} onChange={e=>onChange(e.target.value)}/>
    <div className="void-rating-exact"><label htmlFor={`${id}-value`}><Icon name="star"/> Nota exata</label><input id={`${id}-value`} type="text" inputMode="decimal" required maxLength={3} pattern="(?:[0-4]([.,][0-9])?|5([.,]0)?)" value={value} aria-describedby={`${id}-hint`} aria-invalid={value !== '' && !Number.isFinite(rating) || undefined} onChange={e=>onChange(e.target.value)}/><span>/ 5</span></div>
    <p id={`${id}-hint`}>De 0 a 5, com uma casa decimal. Ex.: 3,5 · 4,2 · 4,7.</p>
  </fieldset>;
}
