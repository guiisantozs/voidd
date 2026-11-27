import Link from 'next/link';
import {useState} from 'react';
import Icon,{RatingStars} from '../Icon';
import {ProfilePoster,ProfileError,ProfileSkeleton} from './ProfileUI';
import {useProfileContent} from '../../lib/use-profile-content';
import {annualActivity,diaryGroups,profileReviewHref} from '../../lib/profile-content';
import {parseRating} from '../../lib/ratings';
import {formatRating} from '../../lib/catalog';

const displayDate=(date,options)=>new Date(`${date}T12:00:00Z`).toLocaleDateString('pt-BR',{...options,timeZone:'UTC'});
function ActivityCalendar({year,days}){
 const cells=annualActivity(year,days),total=days.reduce((count,day)=>count+Number(day.total),0);
 return <section className="vp-calendar" aria-label={`Calendário de atividade de ${year}`}><p>{total} {total===1?'obra registrada':'obras registradas'} em {year}</p><div className="vp-calendar-scroll" tabIndex={0} role="region" aria-label="Calendário anual, role horizontalmente para ver todos os meses"><div className="vp-calendar-months" aria-hidden="true" style={{gridTemplateColumns:`repeat(${Math.ceil(cells.length/7)},12px)`}}>{cells.map((cell,index)=>cell?.date.endsWith('-01')?<span key={cell.date} style={{gridColumn:Math.floor(index/7)+1}}>{displayDate(cell.date,{month:'short'}).replace('.','')}</span>:null)}</div><div className="vp-calendar-grid" role="list">{cells.map((cell,index)=>cell?<span key={cell.date} role="listitem" data-level={Math.min(4,cell.total)} aria-label={`${displayDate(cell.date)}: ${cell.total} registros`} title={`${displayDate(cell.date)}: ${cell.total} registros`}/>:<span key={`empty-${index}`} aria-hidden="true" className="vp-calendar-padding"/>)}</div></div><p className="vp-calendar-legend">Menos <span data-level="0"/><span data-level="1"/><span data-level="2"/><span data-level="3"/><span data-level="4"/> Mais</p></section>;
}
export default function ProfileDiary({target}){
 const [year,setYear]=useState(new Date().getFullYear()),state=useProfileContent(target,'diary',year),years=[...new Set([year,new Date().getFullYear(),...(state.years||[])])].sort((a,b)=>b-a);
 return <section className="vp-section vp-diary"><div className="vp-section-title"><h2>Diário</h2><label>Ano <select value={year} onChange={e=>setYear(Number(e.target.value))}>{years.map(y=><option key={y}>{y}</option>)}</select></label></div>{state.error&&<ProfileError retry={state.refresh}/>} {state.loading&&!state.rows.length?<ProfileSkeleton/>:<><ActivityCalendar year={year} days={state.days||[]}/>{diaryGroups(state.rows).map(group=><section className="vp-diary-month" key={group.month}><h3>{displayDate(`${group.month}-01`,{month:'long',year:'numeric'})}</h3><ol>{group.entries.map(row=>{
 const item=row.payload.item,rating=parseRating(row.payload.nota),hasText=!!row.payload.texto?.trim();
 return <li key={row.item_key}><time dateTime={row.consumed_on}>{row.consumed_on.slice(-2)}</time><Link href={profileReviewHref(item,target)} className="vp-diary-poster"><ProfilePoster item={item} sizes="48px"/></Link><div><Link href={profileReviewHref(item,target)}>{item.titulo}</Link><small>{item.ano}</small><span className="vp-diary-rating" aria-label={`Nota ${formatRating(rating)} de 5`}><RatingStars value={rating}/>{formatRating(rating)}</span></div>{hasText&&<Link href={profileReviewHref(item,target)} aria-label={`Ler avaliação de ${item.titulo}`} title="Ler avaliação"><Icon name="list"/></Link>}</li>;
 })}</ol></section>)}{!state.rows.length&&!state.error&&<p className="vp-empty">Nenhuma história registrada neste ano.</p>}</>}{state.rows.length<state.total&&!state.error&&<button className="vp-load-more" disabled={state.loading} onClick={state.more}>{state.loading?'Carregando…':'Carregar mais'}</button>}</section>;
}
