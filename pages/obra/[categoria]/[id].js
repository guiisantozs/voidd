import RecommendWork from '../../../components/social/RecommendWork';
import Icon from '../../../components/Icon';
import WorkAvatarLayout from '../../../components/avatars/WorkAvatarLayout';
import AddToList from '../../../components/lists/AddToList';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Poster from '../../../components/Poster';
import { categories, formatRating, itemKey, readReviews } from '../../../lib/catalog';
import { fetchWork } from '../../../lib/work-client';
import GameDetail from '../../../components/GameDetail';
import MovieDetail from '../../../components/movies/MovieDetail';
import SeriesDetail from '../../../components/series/SeriesDetail';
import MovieUniverses from '../../../components/universes/MovieUniverses';
import { editorialGames } from '../../../lib/games';

export default function Obra({ categoryOverride }) {
  const router = useRouter();
  const categoryKey = categoryOverride || router.query.categoria;
  const [item, setItem] = useState(null);
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!router.isReady) return;
    const category = categories.find(c => c.key === categoryKey);
    const routeId = router.query.id;
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError(''); setWarning(''); setItem(null); setReview(null);
      if (!category || typeof routeId !== 'string') {
        setError('Endereço de obra inválido.'); setLoading(false); return;
      }
      const id = routeId;
      let fallback;
      try {
        const saved = readReviews()[`${category.key}:${id}`];
        setReview(saved || null);
        fallback = saved?.item;
      } catch { setWarning('Não foi possível recuperar sua avaliação local.'); }
      try {
        if (!fallback) fallback = JSON.parse(sessionStorage.getItem(`void:item:${category.key}:${id}`) || 'null');
      } catch { /* A consulta por ID funciona sem cópia local. */ }
      if (!fallback && category.key === 'jogos') fallback = editorialGames.find(game => String(game.id) === id);
      try {
        const work = await fetchWork(category.key, id, controller.signal);
        if (controller.signal.aborted) return;
        setItem(work);
        try { sessionStorage.setItem(`void:item:${itemKey(work)}`, JSON.stringify(work)); } catch { /* Leitura continua disponível. */ }
      } catch (err) {
        if (controller.signal.aborted) return;
        if (fallback && String(fallback.id) === id && fallback.categoria === category.key) {
          setItem(fallback);
          setWarning(`${err.message} Exibindo a cópia salva neste navegador; os detalhes podem estar incompletos.`);
        } else setError(err.message);
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    load();
    return () => controller.abort();
  }, [router.isReady, categoryKey, router.query.id, attempt]);

  if (categoryKey === 'jogos') return <GameDetail onReviewSaved={setReview} item={item} review={review} loading={loading} error={error} warning={warning} retry={() => setAttempt(value => value + 1)} />;
  if (categoryKey === 'filmes') return <MovieDetail item={item} review={review} loading={loading} error={error} warning={warning} retry={() => setAttempt(value => value + 1)} />;
  if (categoryKey === 'animes' || categoryKey === 'series' && !item?.isAnime) return <SeriesDetail media={categoryKey} item={item} review={review} loading={loading} error={error} warning={warning} retry={() => setAttempt(value => value + 1)} />;
  return <><Head><title>{item ? `${item.titulo} — Void` : 'Explorar uma obra — Void'}</title><meta name="description" content={item?.sinopse?.slice(0, 155) || 'Conheça esta obra e registre sua avaliação no Void.'} /></Head>
    <header className="header"><Link className="logo" href="/">void<span><Icon name="dot" /></span></Link><Link className="text-button" href="/"><Icon name="arrow-left" />{" Voltar ao catálogo"}</Link></header>
    <main className="detail-page">{loading ? <p role="status">Buscando a história por trás dessa obra…</p> : error ? <section className="notice" role="alert"><h1>Não conseguimos abrir esta obra</h1><p>{error}</p><button className="text-button" onClick={() => setAttempt(value => value + 1)}>{"Tentar novamente "}<Icon name="refresh" /></button></section> : item && <>
      {warning && <div className="notice" role="status"><p>{warning}</p><button className="text-button" onClick={() => setAttempt(value => value + 1)}>{"Atualizar detalhes "}<Icon name="refresh" /></button></div>}
      <section className="detail-heading"><Poster key={itemKey(item)} item={item} /><div><p className="eyebrow">UMA HISTÓRIA PARA O SEU UNIVERSO</p><p className="muted">{categories.find(c => c.key === item.categoria)?.singular} {item.ano && `· ${item.ano}`}</p><h1>{item.titulo}</h1>{item.autor && <p className="detail-author">{item.autor}</p>}<p className="detail-score"><Icon name="star" />{" "}{formatRating(item.nota)} <span>/ 5 no catálogo</span></p>
      {!!item.generos?.length && <ul className="genre-list" aria-label="Gêneros e temas">{item.generos.map((genre, i) => <li key={`${genre}-${i}`}>{genre}</li>)}</ul>}
      <Link className="button primary" href={{ pathname: '/avaliar', query: { categoria: item.categoria, id: item.id } }}>{review ? 'Editar minha avaliação' : 'Avaliar esta obra'}{" "}<Icon name="arrow-up-right" /></Link><AddToList key={`${item.categoria}:${item.id}`} item={item}/><RecommendWork item={item} received/><p className="muted">Sua opinião fica salva neste navegador.</p></div></section>
      {item.categoria === 'filmes' && <MovieUniverses id={item.id} />}
      <WorkAvatarLayout item={item}><div className="detail-columns"><div><section className="panel"><h2>Sobre a obra</h2><p className="detail-description">{item.sinopse || 'Este provedor ainda não disponibilizou uma sinopse para esta obra.'}</p></section>
      {!!item.creditos?.length && <section className="panel"><h2>Quem dá vida à história</h2><ul className="credits-list">{item.creditos.map((person, i) => <li key={`${person.nome}-${i}`}><strong>{person.nome}</strong><span>{person.papel}</span></li>)}</ul></section>}
      <section className="panel"><h2>Sua marca nessa história</h2>{review ? <><p className="detail-score"><Icon name="star" />{" "}{formatRating(review.nota)} <span>/ 5 · {review.data}{review.favorito ? <>{" · Favorito "}<Icon name="heart" /></> : ''}</span></p>{review.texto ? review.spoiler ? <details><summary>Mostrar sua avaliação com spoilers</summary><p className="detail-description">{review.texto}</p></details> : <p className="detail-description">{review.texto}</p> : <p className="muted">Você registrou uma nota sem comentário.</p>}</> : <p className="muted">Você ainda não avaliou esta obra. Que tal registrar o que ela deixou em você?</p>}</section></div>
      <aside><section className="panel"><h2>Ficha da obra</h2>{item.informacoes?.length ? <dl className="work-facts">{item.informacoes.map(info => <div key={info.label}><dt>{info.label}</dt><dd>{info.valor}</dd></div>)}</dl> : <p className="muted">Não há informações adicionais disponíveis.</p>}{item.fonteUrl && <a className="text-button" href={item.fonteUrl} target="_blank" rel="noopener noreferrer">Ver no {item.fonte}{" "}<Icon name="arrow-up-right" /></a>}<p className="muted">Informações e notas do catálogo podem mudar.</p></section></aside></div></WorkAvatarLayout>
    </>}</main></>;
}
