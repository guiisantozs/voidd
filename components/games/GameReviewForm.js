import RecommendWork from '../social/RecommendWork';
import { useEffect, useRef, useState } from 'react';
import { useAccount } from '../AccountProvider';
import Icon from '../Icon';
import RatingInput from '../RatingInput';
import ReviewVisibility from '../ReviewVisibility';
import { scopedStorage } from '../../lib/account-storage';
import { itemKey, formatRating } from '../../lib/catalog';
import { useMovieRelease } from '../../lib/use-movie-release';
import { gameReviewForm } from '../../lib/game-review';
import { saveReviewRecord } from '../../lib/review-save';

export function GameReviewDetails({ record }) {
  const body = <><p className="gp-review-text">{record.texto || 'Uma nota também conta uma história. Você ainda não escreveu uma review.'}</p>{(record.positives || record.negatives) && <div className="gp-pros-cons">{record.positives && <div><strong><Icon name="plus"/> Pontos positivos</strong><p>{record.positives}</p></div>}{record.negatives && <div><strong><Icon name="minus"/> Pontos negativos</strong><p>{record.negatives}</p></div>}</div>}</>;
  return <>{record.recommendation && <p className="gp-recommendation"><Icon name={record.recommendation === 'yes' ? 'check' : 'minus'}/>{record.recommendation === 'yes' ? 'Recomenda este jogo' : 'Não recomenda este jogo'}</p>}{record.spoiler ? <details className="gp-spoiler"><summary>Contém spoilers · mostrar review</summary>{body}</details> : body}</>;
}

export function GameReviewExtras({ form, change }) {
  return <><fieldset className="gp-recommend-picker"><legend>Você recomenda este jogo?</legend>{[['yes', 'Recomendo'], ['no', 'Não recomendo']].map(([value, label]) => <button type="button" key={value} aria-pressed={form.recommendation === value} onClick={() => change('recommendation', form.recommendation === value ? '' : value)}>{label}</button>)}</fieldset><div className="gp-pros-cons"><label className="gp-field">Pontos positivos<textarea aria-label="Pontos positivos" rows={3} maxLength={500} value={form.positives || ''} onChange={e => change('positives', e.target.value)}/></label><label className="gp-field">Pontos negativos<textarea aria-label="Pontos negativos" rows={3} maxLength={500} value={form.negatives || ''} onChange={e => change('negatives', e.target.value)}/></label></div></>;
}

export default function GameReviewForm({ item, review, onSaved, favoriteIntent = 0, reviewIntent }) {
  const { user, ownProfile, synchronize } = useAccount();
  const release = useMovieRelease(item), owner = user?.id || null;
  const [form, setForm] = useState(() => gameReviewForm(review, !!user));
  const [editing, setEditing] = useState(!review), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [expanded,setExpanded]=useState(true);
  const section=useRef(null);
  const locked = useRef(false), scope = useRef(owner), dirty = useRef(false); scope.current = owner;
  useEffect(() => {
    dirty.current = false; setMessage(''); setEditing(!review);
    try {
      const draft = JSON.parse(scopedStorage(localStorage, owner).getItem(`void:draft:${itemKey(item)}`) || 'null');
      setForm(gameReviewForm(draft || review, !!owner));
      if (draft) { setEditing(true); dirty.current = true; setMessage('Rascunho recuperado deste navegador.'); }
    } catch { setForm(gameReviewForm(review, !!owner)); setMessage('Não foi possível recuperar o rascunho.'); }
  }, [item.id, owner]);
  useEffect(() => { if (!dirty.current) { setForm(gameReviewForm(review, !!owner)); setEditing(!review); } }, [review, owner]);
  useEffect(() => () => { scope.current = undefined; }, []);
  function focusEditor(){return requestAnimationFrame(()=>{const target=section.current?.querySelector('input[inputmode="decimal"],button[data-review-edit],button[data-review-expand]')||section.current;target?.focus({preventScroll:true});});}
  useEffect(()=>{
    if(!reviewIntent?.key)return;
    setExpanded(true);
    if(Object.hasOwn(reviewIntent,'rating')){dirty.current=true;setEditing(true);setForm(old=>({...old,nota:reviewIntent.rating}));}
    else if(reviewIntent.edit)setEditing(true);
    const frame=focusEditor();return()=>cancelAnimationFrame(frame);
  },[reviewIntent?.key]);
  useEffect(() => {
    if (!favoriteIntent) return;
    dirty.current = true; setEditing(true); setForm(old => ({ ...old, favorito: !old.favorito }));
    setMessage('Confirme em Salvar avaliação para atualizar seu favorito.');
  }, [favoriteIntent]);
  function change(key, value) { dirty.current = true; setForm(old => ({ ...old, [key]: value })); setMessage(''); }
  async function save(draft = false) {
    if (locked.current) return;
    if (!draft && !release.allowed) { setMessage(release.message); return; }
    locked.current = true; setBusy(true); setMessage('');
    const identity = owner, storage = scopedStorage(localStorage, identity);
    let saved = false;
    try {
      const { record } = saveReviewRecord({ storage, item, form, signedIn: !!identity, draft });
      if (!draft) {
        saved = true;
        dirty.current = false; onSaved(record); setEditing(false);
        if (identity) await synchronize();
      }
      if (scope.current === identity) setMessage(draft ? 'Rascunho salvo neste navegador.' : identity ? 'Avaliação salva e sincronizada.' : 'Avaliação salva neste navegador.');
    } catch (error) {
      if (scope.current === identity) setMessage(error.message === 'INVALID_REVIEW' ? 'Escolha uma nota de 0 a 5 e uma data válida, até hoje.' : saved ? 'Sua avaliação está salva neste navegador. Confira a sincronização em Conta.' : 'Não foi possível salvar. Seus registros anteriores foram preservados.');
    } finally { locked.current = false; if (scope.current === identity) setBusy(false); }
  }
  return <section ref={section} tabIndex={-1} className="gp-panel gp-review-editor" id="sua-jornada" aria-labelledby="gp-review-heading"><div className="gp-section-heading"><div><p className="gp-overline">SUA MARCA NO VOID</p><h2 id="gp-review-heading">Sua avaliação</h2></div>{review && <span className="gp-score-badge"><Icon name="star"/>{formatRating(review.nota)}<small>/ 5</small></span>}</div>
    <RecommendWork item={item}/>{!expanded?<div className="gp-review-collapsed"><p>Sua marca fica para quando você quiser. O status do jogo continua salvo.</p><button type="button" data-review-expand className="game-button-outline" onClick={()=>{setExpanded(true);focusEditor();}}>{review?'Minha avaliação':'Escrever minha avaliação'} <Icon name="arrow-right"/></button></div>:review && !editing ? <><p className="gp-subtle">{review.data?.split('-').reverse().join('/')} · {review.public ? 'Pública' : 'Privada'}{review.favorito ? ' · Favorito' : ''}</p><GameReviewDetails record={review}/><button type="button" data-review-edit className="game-button-outline" onClick={() => { setForm(gameReviewForm(review, !!owner)); setEditing(true);focusEditor(); }}><Icon name="edit"/> Editar avaliação</button></> : <form onSubmit={event => { event.preventDefault(); save(); }}>
      <p className="gp-subtle">O que ficou com você depois de jogar?</p><RatingInput value={form.nota} onChange={value => change('nota', value)}/>
      <fieldset className="gp-recommend-picker"><legend>Você recomenda este jogo?</legend>{[['yes', 'Recomendo', 'check'], ['no', 'Não recomendo', 'minus']].map(([value, label, icon]) => <button type="button" key={value} aria-pressed={form.recommendation === value} onClick={() => change('recommendation', form.recommendation === value ? '' : value)}><Icon name={icon}/>{label}</button>)}</fieldset>
      <label className="gp-field">Sua review <small>opcional</small><textarea value={form.texto} onChange={e => change('texto', e.target.value)} maxLength={2000} rows={6} placeholder="A jogabilidade, o mundo, a história. O que fez essa experiência ser sua?"/></label><div className="gp-form-line"><label><input type="checkbox" checked={form.spoiler} onChange={e => change('spoiler', e.target.checked)}/> Contém spoilers</label><span>{form.texto.length} / 2000</span></div>
      <div className="gp-pros-cons"><label className="gp-field">Pontos positivos<textarea aria-label="Pontos positivos" rows={3} maxLength={500} value={form.positives} onChange={e => change('positives', e.target.value)} placeholder="O que mais funcionou para você?"/></label><label className="gp-field">Pontos negativos<textarea aria-label="Pontos negativos" rows={3} maxLength={500} value={form.negatives} onChange={e => change('negatives', e.target.value)} placeholder="O que poderia ter sido melhor?"/></label></div>
      <div className="gp-form-line"><label className="gp-field">Data da avaliação<input type="date" required max={gameReviewForm(null, false).data} value={form.data} onChange={e => change('data', e.target.value)}/></label><label id="gp-favorite"><input type="checkbox" checked={form.favorito} onChange={e => change('favorito', e.target.checked)}/> <Icon name="heart"/> Marcar como favorito</label></div>
      <ReviewVisibility user={user} profile={ownProfile} isPublic={form.public} onChange={value => change('public', value)}/><p className="gp-subtle">{user ? 'A visibilidade do seu perfil também vale para esta avaliação.' : 'Como visitante, sua avaliação e seus rascunhos ficam neste navegador.'}</p>
      <div className="gp-pros-cons gr-review-context"><label className="gp-field">Status nesta avaliação <small>opcional</small><select value={form.feed_context?.share_status ? form.feed_context.status : ''} onChange={event=>change('feed_context',{...form.feed_context,share_status:!!event.target.value,status:event.target.value})}><option value="">Não compartilhar</option>{[['finished','Finalizei'],['platinum','Platinei / 100%'],['playing','Estou jogando'],['playing_now','Estou jogando agora'],['abandoned','Abandonei']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label className="gp-field">Plataforma em que jogou <small>opcional</small><select value={form.feed_context?.platform||''} onChange={event=>change('feed_context',{...form.feed_context,platform:event.target.value})}><option value="">Não informar</option>{[...new Set([...(item.plataformas||[]),...(form.feed_context?.platform?[form.feed_context.platform]:[])])].map(platform=><option key={platform} value={platform}>{platform}</option>)}</select></label></div><p className="gp-subtle">Essas informações acompanham a visibilidade da avaliação. Sua biblioteca e sua coleção continuam privadas. “Jogando agora” aparece para amigos por até 24 horas após salvar; não é presença ao vivo.</p>
      <div className="gp-editor-actions"><button className="game-button" disabled={busy || !release.allowed}>{busy ? 'Salvando…' : 'Salvar avaliação'}<Icon name="check"/></button><button type="button" className="game-button-outline" disabled={busy} onClick={() => save(true)}>Salvar rascunho</button>{review ? <button type="button" className="gp-text-button" disabled={busy} onClick={() => { dirty.current = false; setEditing(false); }}>Cancelar</button>:<button type="button" className="gp-text-button" disabled={busy} onClick={()=>setExpanded(false)}>Agora não</button>}</div>
    </form>}{!release.allowed && <p className="gp-subtle" role="status">{release.message}</p>}<p className="gp-feedback" role="status" aria-live="polite">{message}</p>
  </section>;
}
