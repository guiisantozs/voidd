import SeriesUnitEditor from '../series/SeriesUnitEditor';
import RecommendWork from '../social/RecommendWork';
import {ShareReviewButton} from '../review-share/ReviewShare';
import { useMovieRelease } from '../../lib/use-movie-release';
import Icon from '../Icon';
import RatingInput from '../RatingInput';
import ReviewVisibility from '../ReviewVisibility';
import { parseRating } from '../../lib/ratings';
import { formatRating } from '../../lib/catalog';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAccount } from '../AccountProvider';
import { DATA_EVENT, REVIEWS_KEY, scopedStorage } from '../../lib/account-storage';
import { cleanReviewText, validReview, reviewError, reviewMovie, reviewIsPublic } from '../../lib/review-detail';

export default function MovieReviewForm({movie,onSaved=()=>{},controller}) {
  const {user,synchronize,ownProfile}=useAccount();
  const standardRelease=useMovieRelease(movie),release=controller?{allowed:controller.allowed,message:controller.releaseMessage}:standardRelease,saving=useRef(false),media=movie.categoria||'filmes',noun=controller?.label||(media==='animes'?'anime':media==='series'?'série':'filme');
  const [mine,setMine]=useState(null),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[remove,setRemove]=useState(false);
  const [form,setForm]=useState({rating:'',text:'',date:'',spoiler:false,revi:false,public:!!user,favorito:false,highlights:[]});
  const key=controller?.key||`${media}:${movie.id}`;
  useEffect(()=>{
    if(controller){setMine(controller.record||null);return;}
    const refresh=()=>{try{setMine(JSON.parse(scopedStorage(localStorage,user?.id||null).getItem(REVIEWS_KEY)||'{}')[key]||null);}catch{setMessage('Não foi possível ler sua avaliação salva.');}};
    refresh();window.addEventListener(DATA_EVENT,refresh);return()=>window.removeEventListener(DATA_EVENT,refresh);
  },[key,user?.id,controller?.record]);
  useEffect(()=>{
    const today=new Date();today.setMinutes(today.getMinutes()-today.getTimezoneOffset());
    setForm({rating:mine?.nota ?? '',text:mine?.texto||'',date:mine?.data||today.toISOString().slice(0,10),spoiler:!!mine?.spoiler,revi:!!mine?.revi,public:reviewIsPublic(mine,!!user),favorito:!!mine?.favorito,highlights:mine?.highlights||[]});
  },[mine,user?.id]);
  const change=(key,value)=>setForm(old=>({...old,[key]:value}));
  async function save(deleting=false){
    if(saving.current||!user)return;
    if(!deleting&&!release.allowed){setMessage(release.message);return;}
    if(!deleting&&!validReview(form)){setMessage('Escolha uma nota de 0 a 5, com até uma casa decimal e uma data válida, até hoje.');return;}
    const owner=user.id;const storage=scopedStorage(localStorage,owner);saving.current=true;setBusy(true);setMessage('');
    try{
      if(controller){await controller.save(form,deleting);setMine(deleting?null:{nota:parseRating(form.rating),texto:cleanReviewText(form.text),data:form.date,spoiler:form.spoiler,public:form.public,highlights:form.highlights||[]});setEditing(false);setRemove(false);setMessage(deleting?'Avaliação apagada.':'Avaliação salva com sucesso.');onSaved();return;}
      const records=JSON.parse(storage.getItem(REVIEWS_KEY)||'{}');
      if(deleting)delete records[key];else records[key]={...(records[key]?.originalRating ? {originalRating:records[key].originalRating} : {}),item:reviewMovie(movie),nota:parseRating(form.rating),ratingScale:5,texto:cleanReviewText(form.text),data:form.date,spoiler:form.spoiler,revi:form.revi,public:form.public,favorito:form.favorito,atualizadoEm:new Date().toISOString()};
      storage.setItem(REVIEWS_KEY,JSON.stringify(records));setMine(records[key]||null);setEditing(false);setRemove(false);setMessage('Sincronizando avaliação…');
      await synchronize();await synchronize();setMessage(deleting?'Avaliação apagada.':'Avaliação salva com sucesso.');onSaved();
    }catch(error){setMessage(controller?error.message:`${reviewError(error)} Se o registro já foi salvo neste navegador, a sincronização continua pendente em Conta.`);}finally{saving.current=false;setBusy(false);}
  }
  const heading=<header className="md-editor-heading"><div><p>{media==='filmes'&&!controller?'SUA MARCA NO FILME':`SUA MARCA · ${noun.toUpperCase()}`}</p><h3>Sua avaliação</h3></div><span>0 — 5 estrelas</span></header>;
  if(!release.allowed)return <section className="md-review-form">{heading}<p role="status" className="md-muted">{release.message}</p>{mine&&<button disabled={busy} onClick={()=>save(true)}>Apagar avaliação</button>}</section>;
  if(!user)return <section className="md-review-form">{heading}<p className="md-muted">Registre o que essa história deixou em você.</p><Link className="md-primary" href="/conta">Entre para avaliar</Link>{!controller&&<Link href={{pathname:'/avaliar',query:{categoria:media,id:movie.id}}}>Continuar como visitante <Icon name="arrow-up-right"/></Link>}</section>;
  if(controller&&['series','animes'].includes(media))return <SeriesUnitEditor form={form} change={change} save={save} mine={mine} editing={editing} setEditing={setEditing} busy={busy} message={message} remove={remove} setRemove={setRemove} user={user} profile={ownProfile} controller={controller} heading={heading}/>;
  return <section className="md-review-form">{!controller&&<RecommendWork item={reviewMovie(movie)}/>} {heading}{mine&&!editing?<>
    <p className="md-own-rating"><Icon name="star"/> {formatRating(mine.nota)} <small>/ 5 · {mine.public?'Pública':'Privada'}{mine.revi?' · Revi':''}</small></p>
    {mine.spoiler?<details><summary>Mostrar sua avaliação com spoilers</summary><p className="md-review-text">{mine.texto||'Sem comentário.'}</p></details>:<p className="md-review-text">{mine.texto||'Você registrou uma nota sem comentário.'}</p>}
    <p className="md-muted">Assistido em {mine.data?.split('-').reverse().join('/')}{mine.favorito?' · Favorito':''}</p><div className="md-actions"><button disabled={busy} onClick={()=>setEditing(true)}>Editar avaliação</button>{media==='filmes'&&!controller&&<ShareReviewButton owner={user.id} itemKey={key}/>}<button disabled={busy} onClick={()=>setRemove(true)}>Apagar</button></div>
    {remove&&<div className="md-inline-confirm"><p>Apagar sua avaliação e removê-la da comunidade?</p><button disabled={busy} onClick={()=>save(true)}>Sim, apagar</button><button onClick={()=>setRemove(false)}>Cancelar</button></div>}
  </>:<form onSubmit={event=>{event.preventDefault();save();}}>
    <div className="md-form-pair">
      <div className="md-editor-rating"><RatingInput value={form.rating} onChange={value=>change('rating',value)}/></div>
      <label className="md-date-field"><span><Icon name="clock"/> Quando assistiu?</span><input type="date" required value={form.date} min={controller?.airDate||undefined} max={new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10)} onChange={e=>change('date',e.target.value)}/><small>Registre o dia em que assistiu.</small></label>
    </div>
    <label className="md-editor-copy"><span>Sua review <small>opcional</small></span><textarea maxLength={2000} rows={5} value={form.text} onChange={e=>change('text',e.target.value)} placeholder="O que ficou com você depois dos créditos?"/><small className="md-editor-count">{form.text.length}/2000</small></label>
    <div className="md-checks">
      <label><input type="checkbox" checked={form.spoiler} onChange={e=>change('spoiler',e.target.checked)}/> Contém spoiler</label>
      {!controller&&<><label><input type="checkbox" checked={form.revi} onChange={e=>change('revi',e.target.checked)}/> Revi</label>
      <label><input type="checkbox" checked={form.favorito} onChange={e=>change('favorito',e.target.checked)}/> Favorito</label></>}
    </div>
    <ReviewVisibility user={user} profile={ownProfile} isPublic={form.public} onChange={value=>change('public',value)}/>
    <div className="md-editor-footer"><p className="md-muted"><Icon name="user"/> {form.public?'Avaliação pública com a identidade do seu perfil.':'Sua avaliação ficará privada.'}</p><div className="md-actions"><button className="md-primary" disabled={busy} type="submit">{busy?'Salvando…':'Salvar avaliação'} <Icon name="arrow-up-right"/></button>{mine&&<button type="button" onClick={()=>setEditing(false)}>Cancelar</button>}</div></div>
  </form>}<p role="status" aria-live="polite">{message}</p></section>;
}
