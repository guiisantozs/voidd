import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAccount } from '../AccountProvider';
import { ProfileAvatar } from '../profile/ProfileUI';
import Icon from '../Icon';
import { GameReviewDetails } from './GameReviewForm';
import GamePresenceBadge from './GamePresenceBadge';
import {useLibrary} from '../../lib/use-library';
import { profileHref } from '../../lib/usernames';
import { formatRating } from '../../lib/catalog';
import { loadGameReviews, gameReviewLikes } from '../../lib/game-community';

function Empty({ icon = 'sparkle', title, children }) { return <div className="gp-empty"><Icon name={icon}/><h3>{title}</h3><p>{children}</p></div>; }
function Failure({ retry }) { return <div className="gp-empty" role="status"><p>Não foi possível carregar as avaliações agora.</p><button className="game-button-outline" onClick={retry}>Tentar novamente</button></div>; }
function ReviewCard({ review, gameKey, onChanged, presence }) {
  const { client, user } = useAccount(), [social, setSocial] = useState({ likes: review.likes, liked: review.liked });
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [retry, setRetry] = useState(0);
  const scope = useRef(user?.id); scope.current = user?.id;
  useEffect(() => {
    let active = true; setSocial({ likes: undefined }); setMessage('');
    if (!retry && Number.isFinite(Number(review.likes)) && typeof review.liked === 'boolean') {
      setSocial({ likes: Number(review.likes), liked: review.liked });
      return () => { active = false; };
    }
    gameReviewLikes(client, gameKey, review.user_id, user?.id).then(data => { if (active) setSocial(data); })
      .catch(() => { if (active) setMessage('Curtidas indisponíveis.'); });
    return () => { active = false; };
  }, [client, gameKey, review.user_id, user?.id, retry, review.likes, review.liked]);
  async function like() {
    if (busy || !user || social.likes == null) return;
    const identity = user.id; setBusy(true); setMessage('');
    try {
      const target = { user_id: identity, item_key: gameKey, review_user: review.user_id };
      const { error } = await (social.liked ? client.from('void_review_likes').delete().eq('user_id', identity).eq('item_key', gameKey).eq('review_user', review.user_id) : client.from('void_review_likes').insert(target));
      if (error) throw error;
      if (scope.current === identity) { setRetry(n => n + 1); onChanged(); }
    } catch { if (scope.current === identity) setMessage('Não foi possível curtir. Entre novamente ou tente mais tarde.'); }
    finally { if (scope.current === identity) setBusy(false); }
  }
  return <article className="gp-public-review"><header><Link href={profileHref(review)}><ProfileAvatar profile={review}/><span><strong>{review.display_name || 'Pessoa do Void'}</strong><small>{review.username ? `@${review.username}` : 'Comunidade Void'}</small></span></Link><span className="gp-score-badge"><Icon name="star"/>{formatRating(review.rating)}<small>/5</small></span></header><GamePresenceBadge record={presence}/><p className="gp-review-date"><time dateTime={review.updated_at}>{review.updated_at ? new Date(review.updated_at).toLocaleDateString('pt-BR') : ''}</time>{review.is_friend && <span>Amigo</span>}</p><GameReviewDetails record={{ texto: review.text, spoiler: review.spoiler, recommendation: review.recommendation, positives: review.positives, negatives: review.negatives }}/><footer>{user ? <button type="button" disabled={busy || social.likes == null} aria-pressed={!!social.liked} onClick={like}><Icon name="heart"/>{social.likes ?? '…'} {social.likes === 1 ? 'curtida' : 'curtidas'}</button> : <Link href="/conta"><Icon name="heart"/>{social.likes ?? '…'} · Entre para curtir</Link>}<Link href={profileHref(review)}>Ver perfil <Icon name="arrow-up-right"/></Link></footer>{message && <p role="status">{message} <button onClick={() => setRetry(n => n + 1)}>Tentar novamente</button></p>}</article>;
}

export default function GameCommunity({ item, summary, revision = 0, section = 'all' }) {
  const { client, user } = useAccount();
  const library=useLibrary();
  const [sort, setSort] = useState('recent'), [offset, setOffset] = useState(0), [attempt, setAttempt] = useState(0);
  const [feed, setFeed] = useState({ loading: true, rows: [] }), [friends, setFriends] = useState({ loading: true, rows: [] });
  function refresh() { setOffset(0); setAttempt(n => n + 1); summary.refresh(); }
  useEffect(() => {
    if (section === 'friends') return;
    let active = true;
    setFeed(old => ({ rows: offset ? old.rows : [], loading: true }));
    if (!client) { setFeed({ error: true, rows: [] }); return; }
    loadGameReviews(client, item.id, { sort, offset }).then(data => {
      if (active) setFeed(old => ({ ...data, rows: offset ? [...old.rows, ...data.rows.filter(row => !old.rows.some(prior => prior.user_id === row.user_id))] : data.rows }));
    }).catch(() => { if (active) setFeed(old => ({ ...old, loading: false, error: true })); });
    return () => { active = false; };
  }, [client, user?.id, item.id, sort, offset, attempt, revision, section]);
  useEffect(() => {
    if (section === 'community') return;
    let active = true; setFriends({ loading: true, rows: [] });
    if (!user || !client) return () => { active = false; };
    loadGameReviews(client, item.id, { friendsOnly: true }).then(data => { if (active) setFriends(data); })
      .catch(() => { if (active) setFriends({ error: true, rows: [] }); });
    return () => { active = false; };
  }, [client, user?.id, item.id, attempt, revision, section]);
  const data = summary.data, distribution = [...(data?.histogram || [])].reverse(), maximum = Math.max(1, ...distribution.map(row => row.total));
  return <>{section!=='friends' && <section className="gp-section" id="comunidade" aria-labelledby="gp-community-title"><div className="gp-section-heading"><div><p className="gp-overline">OUTRAS PERSPECTIVAS, O MESMO UNIVERSO</p><h2 id="gp-community-title">Avaliações da comunidade</h2></div><label className="gp-sort">Ordenar<select value={sort} onChange={event => { setSort(event.target.value); setOffset(0); }}><option value="recent">Mais recentes</option><option value="likes">Mais curtidas</option><option value="highest">Nota mais alta</option><option value="lowest">Nota mais baixa</option></select></label></div>
    <div className="gp-community-layout"><aside className="gp-panel gp-rating-summary">{summary.loading ? <p role="status">Carregando notas…</p> : summary.error ? <Failure retry={summary.refresh}/> : <><span className="gp-overline">COMUNIDADE VOID</span><strong className="gp-average">{formatRating(data?.average)}<small>/ 5</small></strong><p className="gp-subtle">{data?.total || 0} avaliações públicas</p><div className="gp-distribution" aria-label="Distribuição em faixas de meia estrela">{distribution.map(row => <div key={row.rating} aria-label={`Nota ${row.rating}: ${row.total} avaliações`}><span>{formatRating(Number(row.rating))}<Icon name="star"/></span><i><b style={{ width: `${row.total / maximum * 100}%` }}/></i><small>{row.total}</small></div>)}</div><p className="gp-subtle">Notas agrupadas em faixas de meia estrela, incluindo zero.</p></>}</aside><div className="gp-review-feed">{feed.error ? <Failure retry={() => setAttempt(n => n + 1)}/> : !feed.loading && !feed.rows.length ? <Empty title="Toda conversa começa com uma opinião.">Ainda não há avaliações públicas nesta seleção. <a href="#sua-jornada">Deixe sua marca.</a></Empty> : feed.rows.map(review => <ReviewCard key={review.user_id} review={review} presence={review.user_id===user?.id?library.entries[String(item.id)]:null} gameKey={`jogos:${item.id}`} onChanged={refresh}/>)}{feed.loading && <div className="gp-panel gp-loading" role="status">Carregando opiniões…</div>}{!feed.error && feed.rows.length < feed.total && <button className="game-button-outline" disabled={feed.loading} onClick={() => setOffset(feed.rows.length)}>Carregar mais avaliações</button>}</div></div>
    </section>}{section!=='community' && <section className="gp-section" id="amigos" aria-labelledby="gp-friends-title"><div className="gp-section-heading"><div><p className="gp-overline">MELHOR QUANDO É COMPARTILHADO</p><h2 id="gp-friends-title">Amigos que jogaram</h2></div>{user && data?.friendCount > 0 && <span className="gp-subtle">{data.friendCount} amigos · média {formatRating(data.friendAverage)} / 5</span>}</div>{!user ? <Empty icon="users" title="Seu próximo jogo pode vir de uma conversa."><Link href="/conta">Entre na sua conta</Link> para ver as avaliações dos seus amigos.</Empty> : friends.error ? <Failure retry={() => setAttempt(n => n + 1)}/> : friends.loading ? <p role="status">Buscando avaliações dos amigos…</p> : !friends.rows.length ? <Empty icon="users" title="Esse universo ainda espera pelo seu círculo.">Seus amigos ainda não têm avaliações públicas deste jogo. <Link href="/amigos">Encontre amigos no Void.</Link></Empty> : <><div className="gp-friend-grid">{friends.rows.map(review => <ReviewCard key={review.user_id} review={review} presence={review.user_id===user?.id?library.entries[String(item.id)]:null} gameKey={`jogos:${item.id}`} onChanged={refresh}/>)}</div><p className="gp-subtle">Mostrando até 20 avaliações públicas de amigos. Status da biblioteca são pessoais e privados.</p></>}</section>}</>;
}
