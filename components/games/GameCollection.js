import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAccount } from '../AccountProvider';
import { GamesHeader, GamesFooter } from '../GameUI';
import Icon from '../Icon';
import { achievementPercent, collectionGameHref, collectionHours } from '../../lib/game-collection';
import { collectionRequest, syncGameCollection } from '../../lib/game-collection-client';
import CollectionMiniProfile from './CollectionMiniProfile';
import { GamerPublicAppearance } from './GamerAppearance';
import { CollectionPortrait } from './CollectionArtwork';
import SteamFamilyImport from './SteamFamilyImport';
import DetailModal from '../movies/DetailModal';
import { ProfileAvatar } from '../profile/ProfileUI';
import { collectionLevel } from '../../lib/collection-presentation';
import { useRouteTab } from '../../lib/use-route-tab';

function useCollection(target, query = {}) {
 const { client, user, ready } = useAccount();
 const [state, setState] = useState({ loading: true }), [revision, setRevision] = useState(0);
 const queryKey = JSON.stringify(query);
 useEffect(() => {
  if (!ready || !target) return;
  const controller = new AbortController(); setState(old => ({ ...old, loading: true, error: '', locked: false }));
  collectionRequest(client, null, { query: { target, ...JSON.parse(queryKey) }, signal: controller.signal }).then(data => {
   if (!controller.signal.aborted) setState({ data, loading: false });
  }).catch(error => { if (!controller.signal.aborted) setState({ error: error.message, locked: error.status === 403, loading: false }); });
  return () => controller.abort();
 }, [client, ready, target, user?.id, revision, queryKey]);
 return { ...state, refresh: () => setRevision(value => value + 1) };
}
function DateLabel({ value }) { return value ? <time dateTime={value}>{new Date(value).toLocaleDateString('pt-BR')}</time> : <>Indisponível</>; }
function CollectionImage({ game }) {
 return <CollectionPortrait game={game}/>;
}
function Progress({ row }) {
 const percentage = achievementPercent(row);
 return <div className="gc-progress"><div><span>{row.provider === 'steam' ? 'Steam' : row.provider}</span><span>{row.achievement_status === 'none' ? 'Sem conquistas' : percentage === null ? 'Conquistas indisponíveis' : `${row.achievement_unlocked}/${row.achievement_total} · ${percentage}%`}</span></div>{percentage !== null && <progress value={row.achievement_unlocked} max={row.achievement_total} aria-label="Progresso das conquistas" />}{row.achievement_status === 'unavailable' && percentage !== null && <small>Último progresso conhecido; atualização indisponível.</small>}</div>;
}
function Stats({ stats, achievements = false }) {
 return <div className="gc-stats">{[
  [achievements ? 'Conquistas desbloqueadas · Steam' : 'Jogos únicos jogados', achievements ? stats.unlocked ?? 'Indisponível' : stats.games],
  ['Plataformas conectadas', stats.connected ?? 'Indisponível'],
  ['Tempo total registrado', collectionHours(stats.minutes)],
  ['Jogos com 100% das conquistas', stats.completed ?? 'Indisponível'],
 ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}
export function CollectionTabs() {
 return <nav className="gc-tabs" aria-label="Sua área de jogos"><Link href="/jogos/biblioteca">Minha Biblioteca</Link><Link href="/jogos/colecao">Minha Coleção</Link><Link href="/jogos/conquistas">Conquistas</Link></nav>;
}
function Skeleton() { return <div className="gc-grid" role="status" aria-label="Carregando coleção">{Array.from({ length: 6 }, (_, i) => <div key={i} className="gc-skeleton" />)}</div>; }

export default function GameCollectionPage({ achievements = false }) {
 const { user } = useAccount();
 const router=useRouter(),requested=typeof router.query.perfil==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(router.query.perfil)?router.query.perfil:null;
 return <div className="games-shell gc-page"><Head><title>{requested?'Perfil gamer':achievements ? 'Conquistas' : 'Minha Coleção'} — VOID</title></Head><GamesHeader /><main className="gc-main cp-root">{requested&&requested!==user?.id?<PublicCollectionDashboard key={requested} target={requested}/>:user ? <CollectionDashboard key={user.id} userId={user.id} achievements={achievements} /> : <section className="gc-empty"><h1>{achievements ? 'Conquistas' : 'Minha Coleção'}</h1><p>Conecte sua conta VOID para reunir sua história gamer.</p><Link className="game-button" href="/conta">Entrar no VOID</Link></section>}</main><GamesFooter /></div>;
}
function PublicCollectionDashboard({target}) {
 const [tab,setTab]=useRouteTab(['overview','games','achievements'],'overview'),[query,setQuery]=useState(''),[platform,setPlatform]=useState('all'),[order,setOrder]=useState('recent'),[visible,setVisible]=useState(20);
 const state=useCollection(target,tab==='achievements'?{achievements:'1'}:{});
 return <CollectionMiniProfile data={state.data} loading={state.loading} readOnly activeTab={tab} onTab={setTab} query={query} onQuery={value=>{setQuery(value);setVisible(20);}} platform={platform} onPlatform={value=>{setPlatform(value);setVisible(20);}} order={order} onOrder={value=>{setOrder(value);setVisible(20);}} visible={visible} onMore={()=>setVisible(value=>value+20)}>{state.error&&<div className="gc-notice" role="alert"><p>{state.error}</p>{!state.locked&&<button onClick={state.refresh}>Tentar novamente</button>}</div>}</CollectionMiniProfile>;
}
function CollectionDashboard({ userId, achievements }) {
 const router = useRouter();
 const { client } = useAccount();
 const [activeTab, setActiveTab] = useRouteTab(['overview','games','achievements'],achievements ? 'achievements' : 'overview');
 const state = useCollection(userId, activeTab === 'achievements' ? { achievements: '1' } : {}), data = state.data;
 const [query, setQuery] = useState(''), [platform, setPlatform] = useState('all'), [order, setOrder] = useState('recent'), [visible, setVisible] = useState(20);
 const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [actionError, setActionError] = useState(''), [progress, setProgress] = useState(null), [deleting, setDeleting] = useState(false);
 const controller = useRef(null), autoStarted = useRef(false), syncing = useRef(false);
 useEffect(() => () => controller.current?.abort(), []);
 async function synchronize(familyToken = null) {
  // Buttons may pass their click event; only an explicit string starts family sync.
  if (typeof familyToken !== 'string') familyToken = null;
  if (syncing.current) return false;
  syncing.current = true; setBusy(true); setActionError(''); setMessage(''); setProgress(null);
  controller.current = new AbortController();
  try {
   const result = await syncGameCollection(client, userId, { signal: controller.current.signal, onProgress: setProgress, familyToken });
   setMessage(`Seu universo gamer acaba de crescer! Sincronizamos ${result.imported} jogos com atividade confirmada.${result.warnings ? ` Atualização parcial: metadados ou conquistas indisponíveis para ${result.warnings} jogos.` : ''}`); state.refresh(); return true;
  } catch (error) { if (error.name !== 'AbortError') { setActionError(error.message); state.refresh(); } return false; }
  finally { familyToken = null; syncing.current = false; if (!controller.current?.signal.aborted) setBusy(false); }
 }
 useEffect(() => {
  if (!data?.connected || router.query.importar !== 'steam' || autoStarted.current) return;
  const timer = setTimeout(() => { autoStarted.current = true; const { importar, ...query } = router.query; router.replace({ pathname: router.pathname, query }, undefined, { shallow: true }); synchronize(); }, 0);
  return () => clearTimeout(timer);
 }, [data?.connected, router.query.importar]);
 async function privacy(visibility) {
  setBusy(true); setActionError('');
  try { await collectionRequest(client, userId, { method: 'PATCH', body: { visibility } }); state.refresh(); setMessage('Privacidade da coleção atualizada. A visibilidade do perfil também continua valendo.'); }
  catch (error) { setActionError(error.message); } finally { setBusy(false); }
 }
 async function forget() {
  setBusy(true); setActionError('');
  try { await collectionRequest(client, userId, { method: 'DELETE', body: { confirm: 'delete-imported' } }); setDeleting(false); setMessage('Dados importados excluídos. Suas avaliações e Biblioteca foram preservadas.'); state.refresh(); }
  catch (error) { setActionError(error.message); } finally { setBusy(false); }
 }
 async function saveAppearance(field,selection) {
  await collectionRequest(client,userId,{method:'PATCH',body:{action:'appearance',field,selection}});
  state.refresh();setMessage(field==='banner'?'Banner gamer atualizado.':'Jogo favorito atualizado.');
 }
 return <>
  <CollectionMiniProfile data={data} loading={state.loading} activeTab={activeTab} onTab={setActiveTab} busy={busy} synchronize={synchronize} privacy={privacy} onSaveAppearance={saveAppearance}
    query={query} onQuery={value=>{setQuery(value);setVisible(20);}} platform={platform} onPlatform={value=>{setPlatform(value);setVisible(20);}}
    order={order} onOrder={value=>{setOrder(value);setVisible(20);}} visible={visible} onMore={()=>setVisible(value=>value+20)}
    gamesAction={data?.connected ? <SteamFamilyImport busy={busy} error={actionError} progress={progress} onImport={synchronize} onError={setActionError}/> : null}
    achievementSpotlights={<AchievementSpotlights data={data?.spotlights}/> }>
    {busy && progress && <p className="gc-notice" role="status">Sincronizando: {progress.position}/{progress.total} jogos verificados. Você pode sair e retomar depois.</p>}
    {message && <p className="gc-notice" role="status">{message}</p>}{actionError && <p className="gc-notice gc-error" role="alert">{actionError}</p>}
    {state.error && <div className="gc-notice" role="alert"><p>{state.error}</p><button onClick={state.refresh}>Tentar novamente</button></div>}
    {data?.lastSync?.warnings > 0 && <p className="cp-data-note">A última importação teve dados parciais para {data.lastSync.warnings} jogos. Uma nova sincronização pode atualizar os campos indisponíveis.</p>}
    {data && !data.connected && <div className="gc-notice"><p>Steam não conectada. Seu histórico importado continua disponível.</p><Link href="/conta#contas-conectadas">Conectar Steam</Link></div>}
  </CollectionMiniProfile>
  {data && <section className="gc-data-controls"><div><p className="cp-overline">VOCÊ NO CONTROLE</p><h2>Seus dados conectados</h2><p>Desconectar a Steam interrompe novas importações. Você escolhe quando excluir os dados já importados.</p></div>{!deleting ? <button className="game-button-outline" disabled={busy} onClick={() => setDeleting(true)}>Excluir dados importados</button> : <div role="group" aria-label="Confirmar exclusão"><p>Excluir coleção importada e conquistas em destaque? Suas avaliações e os status da Biblioteca serão preservados.</p><button className="game-button" disabled={busy} onClick={forget}>Confirmar exclusão</button><button className="game-button-outline" disabled={busy} onClick={() => setDeleting(false)}>Cancelar</button></div>}</section>}
 </>;
}

function AchievementSpotlights({ data }) {
 return <div className="gc-spotlights">{[['recent', 'Conquistas recentes'], ['rare', 'Conquistas raras · até 10% dos jogadores Steam']].map(([key, title]) => <section key={key}><h2>{title}</h2>{data?.[key]?.length ? <div>{data[key].map(a => <Link key={a.provider + a.external_id + a.key} href={`/jogos/colecao/${a.game_id}?tab=conquistas`}>{a.icon && <img src={a.icon} alt="" loading="lazy" />}<div><strong>{a.title}</strong><span>{a.game}</span><small>{key === 'recent' ? <DateLabel value={a.unlocked_at} /> : `${a.global_percent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% dos jogadores`}</small></div></Link>)}</div> : <p>{key === 'recent' ? 'Nenhuma data de desbloqueio disponível.' : 'Nenhuma conquista rara desbloqueada com dados de raridade disponíveis.'}</p>}</section>)}</div>;
}

export function ConnectedGameHistory({ rawgId, canonicalId, target, expanded = false }) {
 const { user } = useAccount();
 return target || user ? <History key={(target || user.id) + ':' + (rawgId || canonicalId)} target={target || user.id} query={rawgId ? { rawg: String(rawgId) } : { game: canonicalId }} expanded={expanded} /> : null;
}
function History({ target, query, expanded }) {
 const { client, user } = useAccount(), state = useCollection(target, query);
 const [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
 const owner = user?.id === target;
 if (state.loading && !state.data) return <section className="gc-history" role="status">Carregando histórico conectado…</section>;
 if (state.locked) return <section className="gc-history"><p>Esta coleção é privada.</p></section>;
 if (state.error) return <section className="gc-history"><p role="alert">{state.error}</p><button onClick={state.refresh}>Tentar novamente</button></section>;
 const game = state.data?.games?.[0];
 if (!game) return expanded ? <p>Nenhum histórico conectado disponível para este jogo.</p> : null;
 async function feature(row, key, slot) {
  setBusy(true); setMessage('');
  try { await collectionRequest(client, user.id, { method: 'POST', body: { action: 'feature', slot, provider: row.provider, external_id: row.external_id, key } }); setMessage(key ? 'Conquista destacada no perfil.' : 'Destaque removido.'); state.refresh(); }
  catch (error) { setMessage(error.message); } finally { setBusy(false); }
 }
 const recent = state.data.rows.flatMap(row => (row.achievements || []).filter(a => a.unlocked && a.unlocked_at).map(a => ({ ...a, title: row.platform_game.definitions?.find(d => d.key === a.key)?.title || a.key }))).sort((a, b) => b.unlocked_at.localeCompare(a.unlocked_at)).slice(0, 5);
 return <section className="gc-history" id="meu-historico"><p className="gc-eyebrow">DAS SUAS PLATAFORMAS</p><h2>Meu histórico</h2>{!expanded && <Link href={`/jogos/colecao/${game.id}?tab=conquistas`}>Ver todas as conquistas <Icon name="arrow-up-right" /></Link>}{game.platforms.map(row => {
  const definitions = row.platform_game.definitions || [];
  const achievements = (row.achievements || []).map(a => ({ ...definitions.find(d => d.key === a.key), ...a })).sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || (b.unlocked_at || '').localeCompare(a.unlocked_at || ''));
  return <div key={row.provider + row.external_id}><h3>{row.provider === 'steam' ? 'Steam' : row.provider}</h3><p>{collectionHours(row.playtime_minutes)} · Última atividade: <DateLabel value={row.last_played_at} /></p><Progress row={row} />{row.achievement_status === 'none' && <p>Este jogo não disponibiliza conquistas na Steam.</p>}{row.achievement_status === 'unavailable' && <p>Não foi possível atualizar as conquistas. Dados anteriores, quando existentes, continuam abaixo.</p>}{expanded && <div className="gc-achievements">{achievements.map(a => {
   const featured = state.data.highlights.find(h => h.provider === row.provider && h.external_id === row.external_id && h.achievement_key === a.key);
   return <article key={a.key} className={a.unlocked ? 'is-unlocked' : ''}>{(a.unlocked ? a.icon : a.locked_icon) && <img src={a.unlocked ? a.icon : a.locked_icon} alt="" loading="lazy" />}<div><h4>{a.hidden && !a.unlocked ? 'Conquista oculta' : a.title || a.key}</h4>{(!a.hidden || a.unlocked) && <p>{a.description}</p>}<small>{a.unlocked ? <>Desbloqueada · <DateLabel value={a.unlocked_at} /></> : 'Bloqueada'}{a.global_percent !== null && a.global_percent !== undefined && <> · {Number(a.global_percent).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% dos jogadores{a.global_percent <= 10 && a.unlocked ? ' · Rara' : ''}</>}</small>{owner && a.unlocked && <label>Destaque no perfil<select disabled={busy} value={featured?.slot || ''} onChange={event => feature(row, event.target.value ? a.key : null, event.target.value ? Number(event.target.value) : featured.slot)}><option value="">Sem destaque</option><option value="1">Espaço 1</option><option value="2">Espaço 2</option><option value="3">Espaço 3</option></select></label>}</div></article>;
  })}</div>}</div>;
 })}{expanded && recent.length > 0 && <div><h3>Conquistas recentes</h3>{recent.map(a => <p key={a.key}>{a.title} · <DateLabel value={a.unlocked_at} /></p>)}</div>}<p role="status">{message}</p></section>;
}

export function CollectionGamePage({ id, target }) {
 const { user } = useAccount(), state = useCollection(target || user?.id, id ? { game: id } : {});
 const game = state.data?.games?.[0];
 return <div className="games-shell gc-page"><GamesHeader /><main className="gc-main"><CollectionTabs /><Link href="/jogos/colecao">← Minha Coleção</Link>{!user && !target ? <p><Link href="/conta">Entre para ver seu histórico.</Link></p> : state.loading ? <Skeleton /> : state.error ? <p role="alert">{state.error}</p> : !game ? <p>Este jogo não está nesta coleção.</p> : <><Head><title>{game.title} — Minha Coleção · VOID</title></Head><header className="gc-game-heading"><div className="gc-game-cover"><CollectionImage game={game} /></div><div><p className="gc-eyebrow">HISTÓRICO CONECTADO</p><h1>{game.title}</h1>{game.rawg_id ? <Link className="game-button" href={`/obra/jogos/${game.rawg_id}#meu-historico`}>Abrir página do jogo no VOID</Link> : <p>Este jogo ainda não tem uma correspondência confirmada no catálogo do VOID. Seu histórico permanece disponível; nenhuma avaliação ou status foi criado automaticamente.</p>}<p>Dados da Steam · <a href={`https://store.steampowered.com/app/${game.platforms[0].external_id}/`} target="_blank" rel="noopener noreferrer">Ver na Steam</a></p></div></header><ConnectedGameHistory target={target} canonicalId={game.id} expanded /></>}</main><GamesFooter /></div>;
}

export function GamerJourney({ target, achievements = false }) {
 const [expanded,setExpanded]=useState(false);
 const { user } = useAccount(), state = useCollection(target,expanded||achievements?{achievements:'1'}:{}), data = state.data;
 const owner = user?.id === target;
 if (state.loading&&!data) return <section className="gc-profile" role="status">{achievements?'Carregando conquistas…':'Carregando jornada gamer…'}</section>;
 if (state.locked) return owner ? null : <section className="gc-profile"><h2>{achievements?'Conquistas':'Minha jornada gamer'}</h2><p>Coleção privada.</p></section>;
 if (state.error) return <section className="gc-profile"><p role="status">{state.error}</p><button onClick={state.refresh}>Tentar novamente</button></section>;
 if (!data) return null;
 const top = [...data.games].sort((a, b) => (b.minutes ?? -1) - (a.minutes ?? -1)).slice(0, 3);
 const profile={...data.profile,user_id:target},name=profile.display_name||'Perfil gamer',level=collectionLevel(data.stats);
 return <section className="gc-profile gc-profile-compact"><p className="gc-eyebrow">HISTÓRIAS QUE VOCÊ JOGOU</p><h2>{achievements ? 'Conquistas' : 'Minha jornada gamer'}</h2>
 {!achievements&&<button type="button" className="gc-gamer-card" onClick={()=>setExpanded(true)} aria-label={`Ver perfil gamer de ${name}`}><ProfileAvatar profile={profile}/><span><strong>{name}</strong><small>{level?`Nível ${level.level} · ${level.rank}`:'Sua jornada no VOID'}</small><span>Ver perfil gamer completo</span></span><Icon name="arrow-up-right"/></button>}
 <GamerPublicAppearance data={data}/><Stats stats={data.stats} achievements={achievements} />{owner && <p><Link href={achievements ? '/jogos/conquistas' : '/jogos/colecao'}>Abrir {achievements ? 'minhas conquistas' : 'minha coleção'}</Link> · <Link href="/conta#contas-conectadas">Contas conectadas</Link></p>}{top.length ? <div className="gc-top-games">{top.map(game => <Link key={game.id} href={owner ? collectionGameHref(game) : `/jogos/colecao/${game.id}?target=${target}`}><CollectionImage game={game} /><strong>{game.title}</strong><span>{collectionHours(game.minutes)}</span><small>Última atividade: <DateLabel value={game.last_played_at} /></small></Link>)}</div> : <p>Nenhum jogo importado ainda.</p>}<ProfileAchievementWall target={target} highlights={data.highlights} />
 {expanded&&<DetailModal title={`Perfil gamer de ${name}`} className="gc-gamer-detail-modal" trapFocus onClose={()=>setExpanded(false)}><GamerJourneyDetail data={{...data,profile}} loading={state.loading}/></DetailModal>}
 </section>;
}
function GamerJourneyDetail({data,loading}) {
 const [tab,setTab]=useState('overview'),[query,setQuery]=useState(''),[platform,setPlatform]=useState('all'),[order,setOrder]=useState('recent'),[visible,setVisible]=useState(20);
 return <div className="cp-root gc-gamer-detail"><CollectionMiniProfile data={data} loading={loading} readOnly activeTab={tab} onTab={setTab} query={query} onQuery={value=>{setQuery(value);setVisible(20);}} platform={platform} onPlatform={value=>{setPlatform(value);setVisible(20);}} order={order} onOrder={value=>{setOrder(value);setVisible(20);}} visible={visible} onMore={()=>setVisible(value=>value+20)} achievementSpotlights={<AchievementSpotlights data={data.spotlights}/>}/></div>;
}
function ProfileAchievementWall({ target, highlights }) {
 const { client } = useAccount();
 const [items, setItems] = useState([]);
 const ids = [...new Set(highlights.map(h => h.external_id))].join(',');
 useEffect(() => {
  let active = true;
  async function load() {
   const results = await Promise.all(highlights.map(async h => {
    const { data, error } = await client.from('void_game_activity').select('achievements,platform_game:void_game_platform_ids(definitions,game:void_collection_games(title))').eq('user_id', target).eq('provider', h.provider).eq('external_id', h.external_id).maybeSingle();
    if (error || !data?.achievements?.some(a => a.key === h.achievement_key && a.unlocked)) return null;
    const a = data.platform_game.definitions?.find(a => a.key === h.achievement_key);
    return a ? { ...a, slot: h.slot, game: data.platform_game.game.title } : null;
   }));
   if (active) setItems(results.filter(Boolean));
  }
  if (client && highlights.length) load().catch(() => { if (active) setItems([]); }); else setItems([]);
  return () => { active = false; };
 }, [client, target, ids, highlights.map(h => h.achievement_key + h.slot).join(',')]);
 return items.length ? <div className="gc-wall"><h3>Mural gamer</h3><div>{items.map(a => <article key={a.slot}>{a.icon && <img src={a.icon} alt="" loading="lazy" />}<div><strong>{a.title}</strong><small>{a.game} · Steam</small></div></article>)}</div></div> : null;
}
