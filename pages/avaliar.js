import RecommendWork from '../components/social/RecommendWork';
import { GameReviewExtras, GameReviewDetails } from '../components/games/GameReviewForm';
import {ShareReviewButton} from '../components/review-share/ReviewShare';
import { useMovieRelease } from '../lib/use-movie-release';
import MovieHeader from '../components/movies/MovieHeader';
import { GamesHeader } from '../components/GameUI';
import { ReviewBackdrop, ReviewMovieFacts, ReviewCommunity } from '../components/movies/MovieReviewContext';
import Icon from '../components/Icon';
import RatingInput from '../components/RatingInput';
import ReviewVisibility from '../components/ReviewVisibility';
import { parseRating, normalizeReview, tmdbDisplayRating } from '../lib/ratings';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import Poster from '../components/Poster';
import { categories, formatRating, itemKey, readReviews } from '../lib/catalog';
import { fetchWork, workHref } from '../lib/work-client';
import { editorialGames } from '../lib/games';
import { scopedStorage } from '../lib/account-storage';
import { useAccount } from '../components/AccountProvider';
import { validReview, reviewError, reviewIsPublic } from '../lib/review-detail';
import { saveReviewRecord } from '../lib/review-save';
import { legacyGameReviewRedirect } from '../lib/game-review-navigation';

export function getServerSideProps({query}){
  const destination=legacyGameReviewRedirect(query);
  return destination?{redirect:{destination,permanent:false}}:{props:{}};
}

const emptyForm = { nota: '', texto: '', spoiler: false, favorito: false, data: '', public: false, recommendation: '', positives: '', negatives: '' };
function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export default function Avaliar() {
  const { user, synchronize, ownProfile } = useAccount();
  const router = useRouter();
  const [item, setItem] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [shareable,setShareable]=useState(false);
  const [savedReview,setSavedReview]=useState(null),[editing,setEditing]=useState(true);
  const saving=useRef(false),release=useMovieRelease(item);
  const [communityRevision, setCommunityRevision] = useState(0);
  useEffect(() => {
    if (!router.isReady) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError(''); setMessage(''); setItem(null);setShareable(false);
      const category = categories.find(c => c.key === router.query.categoria);
      const id = router.query.id;
      if (!category || typeof id !== 'string') { setError('Escolha uma obra no catálogo para avaliar.'); setLoading(false); return; }
      const key = `${category.key}:${id}`;
      let stored;
      let draft;
      try {
        stored = readReviews()[key];setShareable(!!stored);setSavedReview(stored||null);
        draft = normalizeReview(JSON.parse(scopedStorage(localStorage).getItem(`void:draft:${key}`) || 'null'));
      } catch { setMessage('Não foi possível recuperar os dados locais.'); }
      try {
        let selected = stored?.item || draft?.item;
        if (!selected) {
          try {
            const cached = JSON.parse(sessionStorage.getItem(`void:item:${key}`) || 'null');
            if (cached && String(cached.id) === id && cached.categoria === category.key) selected = cached;
          } catch { /* Recupera a obra pela API se a cópia da sessão não estiver disponível. */ }
        }
        if (!selected) {
          if (category.key === 'jogos') selected = editorialGames.find(game => String(game.id) === id);
        }
        if (!selected || ['filmes', 'jogos'].includes(category.key)) {
          try {
            const full = await fetchWork(category.key, id, controller.signal);
            selected = { ...selected, ...full };
          } catch (err) { if (err.name === 'AbortError' || !selected) throw err; /* A cópia local permite avaliar offline. */ }
        }
        if (controller.signal.aborted) return;
        setItem({ ...selected, categoria: category.key });
        const values = draft || stored;
        setEditing(router.query.editar==='1'||!!draft||!stored);
        setForm({ ...emptyForm, public:reviewIsPublic(values,!!user), data: today(), ...(values ? {
          nota: Number.isFinite(values.nota) && values.nota >= 0 && values.nota <= 5 ? values.nota : '',
          texto: typeof values.texto === 'string' ? values.texto.slice(0, 2000) : '',
          recommendation: values.recommendation || '', positives: values.positives || '', negatives: values.negatives || '', revi: !!values.revi, spoiler: !!values.spoiler, favorito: !!values.favorito, public: reviewIsPublic(values,!!user),
          data: /^\d{4}-\d{2}-\d{2}$/.test(values.data) ? values.data : today(),
        } : {}) });
        if (draft) setMessage('Rascunho recuperado.');
      } catch (err) { if (err.name !== 'AbortError') setError(err.message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    load();
    return () => controller.abort();
  }, [router.isReady, router.query.categoria, router.query.id, user?.id]);
  function change(key, value) { setForm(previous => ({ ...previous, [key]: value })); setMessage(''); }
  async function save(draft) {
    if (saving.current || !item) return;
    if (!draft && !release.allowed) { setMessage(release.message); return; }
    if (!draft && (!Number.isFinite(parseRating(form.nota)))) { setMessage('Escolha uma nota de 0 a 5, com até uma casa decimal.'); return; }
    if (!draft && !validReview({ rating: form.nota, date: form.data, text: form.texto })) { setMessage('Informe uma nota e uma data válidas, até hoje.'); return; }
    // Bind before awaiting the network: signing out must not redirect this write to another account.
    const owner=user?.id;
    const storage = scopedStorage(localStorage, owner || null);
    saving.current=true;setBusy(true);
    try {
      const { record } = saveReviewRecord({ storage, item, form, signedIn: !!owner, draft });
      if (!draft) {
        setSavedReview(record);setEditing(false);setMessage(user?'Sincronizando avaliação…':'Avaliação salva com sucesso.');
      }
      if (!draft && user) { await synchronize();await synchronize();setShareable(true); setCommunityRevision(n=>n+1); }
      setMessage(draft ? 'Rascunho salvo neste navegador.' : 'Avaliação salva com sucesso.');
    } catch (error) { setMessage(`${reviewError(error)} Se já foi salva neste navegador, a avaliação permanece na fila de sincronização em Conta.`); }
    finally { saving.current=false;setBusy(false); }
  }
  const listReturn=typeof router.query.lista==='string'&&/^\/(?:listas\/(?:ver-depois|[a-f0-9-]{36})|jogos\/listas\/(?:quero-jogar|[a-f0-9-]{36}))$/.test(router.query.lista)?router.query.lista:null;
  return <div className={`movies-page void-review-page ${item?.categoria === 'filmes' ? 'movie-detail vr-cinematic' : ''}`}><Head><title>{item ? `Avaliar ${item.titulo} — Void` : 'Avaliar uma obra — Void'}</title></Head>
    {item?.categoria === 'filmes'&&<ReviewBackdrop movie={item}/>}
    {(item?.categoria === 'filmes'||router.query.categoria === 'filmes')?<MovieHeader back={{href:item?workHref(item):'/filmes',label:'Voltar ao filme'}}/>:(item?.categoria==='jogos'||router.query.categoria==='jogos')?<GamesHeader/>:<header className="m-header void-review-header"><Link className="logo" href="/">void<span><Icon name="dot"/></span></Link><Link className="text-button" href={item?workHref(item):'/'}><Icon name="arrow-left"/> Voltar à obra</Link></header>}
    <main className="review-page">{listReturn&&<Link className="vl-back" href={listReturn}><Icon name="arrow-left"/> Voltar para a lista</Link>}{loading ? <p role="status">Carregando obra…</p> : error ? <div className="notice" role="alert"><p>{error}</p><Link href="/">Voltar ao catálogo</Link></div> : item && <>
      <section className="work-heading">{item.categoria !== 'filmes'&&<Poster item={item} />}<div><p className="eyebrow">SUA PRÓXIMA MARCA NO VOID</p><h1>{item.titulo}</h1><p className="muted">{categories.find(c => c.key === item.categoria)?.singular} · {item.ano || 'Ano não informado'}{" · "}<Icon name="star" />{" "}{formatRating(item.categoria === 'filmes' ? tmdbDisplayRating(item) : item.nota)} / 5 · {item.categoria === 'filmes' ? 'TMDB' : 'Catálogo'}</p>{item.autor && <p>{item.autor}</p>}{item.sinopse && <p className="synopsis">{item.sinopse}</p>}</div></section>
      <RecommendWork item={item}/>
      <div className="vr-review-layout">{item.categoria === 'filmes'&&<ReviewMovieFacts movie={item}/>}
      {savedReview&&!editing&&release.allowed?<section className="vr-review-form panel"><h2>Sua avaliação</h2><p className="detail-score"><Icon name="star"/> {formatRating(savedReview.nota)} <small>/ 5</small></p><p className="muted">{savedReview.data?.split('-').reverse().join('/')} · {savedReview.public?'Pública':'Privada'}{savedReview.favorito?' · Favorito':''}{savedReview.revi?' · Revi':''}</p>{item.categoria==='jogos'?<GameReviewDetails record={savedReview}/>:savedReview.spoiler?<details><summary>Mostrar avaliação com spoilers</summary><p className="md-review-text">{savedReview.texto||'Sem comentário.'}</p></details>:<p className="md-review-text">{savedReview.texto||'Você registrou uma nota sem comentário.'}</p>}<p className="save-message" role="status" aria-live="polite">{message}</p>{!release.allowed&&<p role="status">{release.message}</p>}<div className="review-actions"><button className="button primary" disabled={busy||!release.allowed} onClick={()=>{setForm({...emptyForm,...savedReview});setEditing(true);setMessage('');}}>Editar avaliação</button>{user&&shareable&&item.categoria==='filmes'&&release.allowed&&<ShareReviewButton owner={user.id} itemKey={itemKey(item)}/>}</div></section>:<form className="vr-review-form" onSubmit={event => { event.preventDefault(); save(false); }}><section className="panel"><h2>O que essa história deixou?</h2>{savedReview&&!release.allowed&&<p role="status" className="notice">Há um registro local antigo deste filme. Ele não é uma avaliação publicada e não pode ser enviado antes da estreia.</p>}{!release.allowed&&<p className="notice" role="status">{release.message}</p>}<p className="muted">Sua nota, do seu jeito. De zero a cinco, com uma casa decimal.</p><RatingInput value={form.nota} onChange={value=>change('nota',value)}/></section>
      <section className="panel"><label className="field-title" htmlFor="texto">Sua avaliação <small>opcional</small></label><textarea id="texto" value={form.texto} onChange={event => change('texto', event.target.value)} maxLength={2000} rows={6} placeholder="O que você sentiu? O que ficou com você?" /><div className="form-line"><label><input type="checkbox" checked={form.spoiler} onChange={event => change('spoiler', event.target.checked)} /> Contém spoilers</label><span className="muted">{form.texto.length}/2000</span></div></section>
      {item.categoria === 'jogos' && <section className="panel"><GameReviewExtras form={form} change={change}/></section>}<section className="panel"><div className="form-line"><label htmlFor="data">Quando você terminou?</label><input id="data" type="date" max={today()} required value={form.data} onChange={event => change('data', event.target.value)} /></div><label className="favorite"><input type="checkbox" checked={form.favorito} onChange={event => change('favorito', event.target.checked)} /> Marcar como favorito</label></section>
      <section className="panel"><ReviewVisibility user={user} profile={ownProfile} isPublic={form.public} onChange={value=>change('public',value)}/></section><p className="muted">{user ? 'Avaliações novas são públicas por padrão. Você pode marcar como privada. Rascunhos ficam neste navegador.' : 'Como visitante, seus registros ficam apenas neste navegador.'}</p><div className="review-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => save(true)}>Salvar rascunho</button><button className="button primary" disabled={busy||!release.allowed} type="submit">{busy ? "Salvando… " : "Salvar avaliação "}<Icon name="arrow-up-right" /></button></div><p role="status" className="save-message">{message}</p>{user&&shareable&&item.categoria==='filmes'&&<ShareReviewButton owner={user.id} itemKey={itemKey(item)}/>}</form>}
      {item.categoria === 'filmes'&&<ReviewCommunity key={item.id} movie={item} revision={communityRevision}/>}</div>
    </>}</main></div>;
}
