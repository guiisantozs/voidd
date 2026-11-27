import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Icon from '../Icon';
import { useAccount } from '../AccountProvider';
import { ProfileAvatar } from '../profile/ProfileUI';
import { collectionGameHref, collectionHours, collectionProviders, filterCollection } from '../../lib/game-collection';
import { collectionBadges, collectionLevel, gameAchievementSummary } from '../../lib/collection-presentation';

import { CollectionPortrait, GameLandscape } from './CollectionArtwork';
export { CollectionPortrait } from './CollectionArtwork';
import { GamerAppearancePicker, GamerShareButton, PlayedGenrePills, TopPlayedPanel } from './GamerAppearance';
import { useGamerMetadata } from '../../lib/use-gamer-metadata';
import { bannerSources, favoriteAsGame, favoriteGameHref, gamerGameHref } from '../../lib/gamer-profile';

const tabs = [['overview', 'Visão geral', 'user'], ['games', 'Jogos', 'gamepad'], ['achievements', 'Conquistas', 'trophy']];
const dateTime = value => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Data indisponível';

function Count({ value, decimals = 0, suffix = '' }) {
  const [display, setDisplay] = useState(0), previous = useRef(0);
  const known = typeof value === 'number' && Number.isFinite(value);
  useEffect(() => {
    if (!known) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { previous.current = value; setDisplay(value); return; }
    const start = performance.now(), from = previous.current;
    let frame;
    const tick = now => { const fraction = Math.min(1, (now - start) / 850); const next = from + (value - from) * (1 - (1 - fraction) ** 3); setDisplay(next); previous.current = next; if (fraction < 1) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, known]);
  const format = number => number.toLocaleString('pt-BR', { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
  return known ? <span aria-label={format(value) + suffix}><span aria-hidden="true">{format(decimals ? display : Math.round(display))}{suffix}</span></span> : <span title="Informação indisponível">—</span>;
}

function AchievementRing({ game, compact = false }) {
  const summary = gameAchievementSummary(game);
  if (summary.percent === null) return <span className="cp-progress-unavailable" role="img" tabIndex={0} title={summary.none ? 'Este jogo não disponibiliza conquistas.' : 'Conquistas indisponíveis'} aria-label={summary.none ? 'Sem conquistas' : 'Conquistas indisponíveis'}><Icon name="trophy" /></span>;
  return <span className={`cp-ring ${summary.completed ? 'is-complete' : ''} ${compact ? 'is-compact' : ''}`} role="img" aria-label={`${summary.unlocked} de ${summary.total} conquistas, ${summary.percent}%${summary.stale ? ', último progresso conhecido' : ''}`} title={summary.stale ? 'Último progresso conhecido; atualização indisponível.' : `${summary.unlocked}/${summary.total} conquistas`}>
    <svg viewBox="0 0 44 44" aria-hidden="true"><circle className="cp-ring-track" cx="22" cy="22" r="18" /><circle className="cp-ring-value" cx="22" cy="22" r="18" pathLength="100" strokeDasharray={`${summary.percent} 100`} /></svg><span>{summary.completed ? <Icon name="trophy" /> : <>{summary.percent}<small>%</small></>}</span>
  </span>;
}

function GameChips({ game }) {
  const progress = gameAchievementSummary(game);
  return <div className="cp-game-chips"><span><Icon name="clock" />{collectionHours(game.minutes)}</span>{progress.percent !== null ? <><span><Icon name="trophy" />{progress.unlocked}/{progress.total}</span><span className={progress.completed ? 'is-gold' : ''}>{progress.percent}%</span></> : <span className="cp-muted-chip" title={progress.none ? 'Este jogo não disponibiliza conquistas.' : 'Conquistas indisponíveis'}><Icon name="trophy" /><span className="sr-only">{progress.none ? 'Sem conquistas' : 'Conquistas indisponíveis'}</span></span>}</div>;
}

function ProfileHeader({ data, activeTab, onTab, onChoose, readOnly }) {
  const { user, ownProfile } = useAccount();
  const profile = (readOnly ? data?.profile : ownProfile || data?.profile) || (readOnly ? {display_name:'Perfil gamer'} : { display_name: user?.user_metadata?.display_name || user?.user_metadata?.name || 'Seu perfil', avatar_url: user?.user_metadata?.avatar_url });
  const level = collectionLevel(data?.stats);
  const mostPlayed = [...(data?.games || [])].sort((a, b) => (b.minutes ?? -1) - (a.minutes ?? -1))[0];
  const name = profile.display_name || 'Seu perfil';
  const buttons = useRef([]);
  const banner=data?.appearance?.banner, favorite=data?.appearance?.favorite;
  return <header className="cp-profile">
    <div className={`cp-profile-banner ${banner?'has-custom-banner':''}`}><GameLandscape game={mostPlayed} sources={bannerSources(banner,mostPlayed)} style={{'--gamer-x':`${banner?.x??50}%`,'--gamer-y':`${banner?.y??40}%`}}/><div className="cp-banner-overlay" /><div className="cp-banner-caption"><span><span className="cp-live-dot" /> VOID <b>PLAY</b></span></div><div className="cp-banner-tools">{!readOnly&&data&&<button className="cp-change-banner" type="button" onClick={()=>onChoose('banner')}><Icon name="edit"/>Alterar banner</button>}{data&&<GamerShareButton data={data}/>}</div><div className="cp-favorite-slot">{favorite?<><Link className="cp-favorite-game" href={favoriteGameHref(favorite,readOnly?data.profile?.user_id:null)}><CollectionPortrait game={favoriteAsGame(favorite)} decorative/><span><small>JOGO FAVORITO</small><strong>{favorite.title}</strong></span></Link>{!readOnly&&<button type="button" onClick={()=>onChoose('favorite')} aria-label="Escolher jogo favorito"><Icon name="edit"/></button>}</>:!readOnly&&data?<button className="cp-favorite-empty" type="button" onClick={()=>onChoose('favorite')} aria-label="Escolher jogo favorito"><Icon name="heart"/><span>Escolha seu jogo favorito</span><Icon name="plus"/></button>:<span className="cp-favorite-empty">Nenhum favorito definido</span>}{mostPlayed&&<small className="cp-most-played">Mais jogado: {mostPlayed.title} · {collectionHours(mostPlayed.minutes)}</small>}</div></div>
    <div className="cp-profile-identity"><div className="cp-avatar-wrap"><svg className="cp-avatar-xp" viewBox="0 0 132 132" aria-hidden="true"><circle className="cp-avatar-xp-track" cx="66" cy="66" r="63"/><circle className="cp-avatar-xp-value" cx="66" cy="66" r="63" pathLength="100" strokeDasharray={`${(level?.current||0)/10} 100`}/></svg><ProfileAvatar profile={profile} fallback="void" /><span className="cp-level-seal" title={level ? `Nível ${level.level}` : 'Carregando nível'}><small>NV.</small>{level?.level ?? '—'}</span></div><div className="cp-profile-name"><p>SEU MINI PERFIL GAMER</p><h1>{name}</h1><span>{(data?.connected||data?.games.some(game=>game.platforms.some(row=>row.provider==='steam'))) ? <><span className="cp-online-dot" /> Steam</> : 'Sua coleção'} <span aria-hidden="true">·</span> {data ? `${data.stats.games} jogos` : 'Carregando…'}{profile.username && <small>@{profile.username}</small>}</span></div><div className="cp-xp" title="10 XP por hora jogada + 25 por conquista desbloqueada + 250 por jogo com 100%. Cada nível tem 1.000 XP. Cálculo visual com os dados disponíveis."><span className="cp-rank"><Icon name="diamond" />{level?.rank || 'Carregando'}</span><div><strong>Nível {level?.level ?? '—'}</strong><span>{level ? `${level.current.toLocaleString('pt-BR')}/${level.next.toLocaleString('pt-BR')} XP` : '—/— XP'}</span></div><progress value={level?.current || 0} max={1000} aria-label="XP do nível atual" /><small>XP dos dados disponíveis <span aria-hidden="true">ⓘ</span></small></div></div>
    <nav className="cp-profile-tabs" role="tablist" aria-label="Seções da Minha Coleção">{tabs.map(([key, label, icon], index) => <button key={key} type="button" id={`cp-tab-${key}`} role="tab" aria-selected={activeTab === key} aria-controls={`cp-panel-${key}`} tabIndex={activeTab === key ? 0 : -1} ref={node => { buttons.current[index] = node; }} onClick={() => onTab(key)} onKeyDown={event => { const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1; if (next < 0) return; event.preventDefault(); onTab(tabs[next][0]); buttons.current[next]?.focus(); }}><Icon name={icon} />{label}</button>)}</nav>
  </header>;
}

function StatusStrip({ data, busy, synchronize, onGames, readOnly, target }) {
  const top = [...data.games].sort((a, b) => (b.minutes ?? -1) - (a.minutes ?? -1)).slice(0, 6);
  return <section className="cp-status-strip" aria-label="Resumo da sua coleção"><div className="cp-status-numbers">{[
    ['gamepad', 'Jogos únicos', data.stats.games, 0, ''], ['clock', 'Tempo total', data.stats.minutes === null ? null : data.stats.minutes / 60, 1, ' h'], ['trophy', 'Conquistas', data.stats.unlocked, 0, ''], ['diamond', 'Jogos com 100%', data.stats.completed, 0, ''],
  ].map(([icon, label, value, decimals, suffix]) => <div key={label}><span><Icon name={icon} />{label}</span><strong><Count value={value} decimals={decimals} suffix={suffix} /></strong></div>)}</div><div className="cp-top-played"><span>SEUS UNIVERSOS</span><div>{top.map(game => <Link key={game.id} href={gamerGameHref(game, target)} title={`${game.title} · ${collectionHours(game.minutes)}`}><CollectionPortrait game={game} decorative /></Link>)}{!top.length && <button type="button" onClick={onGames} className="cp-top-empty"><Icon name="gamepad" /><span>Explore seus jogos</span></button>}</div></div>{!readOnly && <div className="cp-sync-actions"><button type="button" className="cp-primary" disabled={busy || !data.connected} onClick={synchronize}><Icon name="refresh" className={busy ? 'cp-spin' : ''} />{busy ? 'Atualizando…' : 'Sincronizar'}</button><Link href="/conta#contas-conectadas">Contas conectadas <Icon name="arrow-up-right" /></Link></div>}</section>;
}

function RecentActivity({ data, onGames, metadata, target }) {
  const recent = [...data.games].filter(game => game.last_played_at).sort((a, b) => b.last_played_at.localeCompare(a.last_played_at)).slice(0, 6);
  const hasNew = recent.some(game => Date.parse(game.last_played_at) >= Date.now() - 7 * 86400000);
  return <section className="cp-recent"><div className="cp-section-heading"><div><p>SUAS ÚLTIMAS INCURSÕES</p><h2>Atividade recente</h2></div><button type="button" onClick={onGames}>Ver tudo <Icon name="arrow-up-right" /></button></div><div className="cp-activity-list">{recent.map(game => {
    const achievement = data.spotlights?.recent?.find(a => a.game_id === game.id);
    const stale = Date.parse(game.last_played_at) < Date.now() - 7 * 86400000;
    return <article key={game.id} className={`cp-activity-card ${stale ? 'is-quiet' : ''}`}><div className="cp-activity-art"><GameLandscape game={game} metadata={metadata[game.rawg_id]} /></div><Link className="cp-activity-link" href={gamerGameHref(game, target)}><div className="cp-activity-marker"><Icon name={achievement ? 'trophy' : 'gamepad'} /></div><div className="cp-activity-copy"><p>{stale ? 'ÚLTIMA ATIVIDADE REGISTRADA' : 'JOGOU RECENTEMENTE'} <span>· Steam</span></p><h3>{game.title}</h3><time dateTime={game.last_played_at}>{dateTime(game.last_played_at)}</time>{achievement && <span className="cp-activity-achievement">{achievement.icon ? <img src={achievement.icon} alt="" /> : <Icon name="trophy" />}{achievement.title}</span>}<GameChips game={game} /></div><Icon className="cp-activity-arrow" name="arrow-up-right" /></Link></article>;
  })}{!hasNew && <article className="cp-quiet-card"><Icon name="moon" /><div><strong>Sem atividade nova</strong><p>{recent.length ? 'Nenhuma atividade registrada nos últimos sete dias.' : 'Ainda não há datas de atividade disponíveis. Seus jogos continuam na aba Jogos.'}</p></div></article>}</div></section>;
}

function GameCard({ game, target }) {
  const progress = gameAchievementSummary(game);
  const steam = game.platforms.some(row => row.provider === 'steam');
  return <article className={`cp-game-card ${progress.completed ? 'is-complete' : ''}`}><Link className="cp-game-cover" href={gamerGameHref(game, target)}><CollectionPortrait game={game} /><span className="cp-platform-badge"><img src={collectionProviders.find(p => p.key === (steam ? 'steam' : game.platforms[0]?.provider))?.icon} alt="" />{steam ? 'Steam' : game.platforms[0]?.provider}</span>{progress.completed && <span className="cp-completion-badge" title="100% das conquistas"><Icon name="trophy" /><span>100%</span></span>}<span className="cp-cover-open"><Icon name="arrow-up-right" /></span></Link><div className="cp-game-info"><div><Link href={gamerGameHref(game, target)}><h3>{game.title}</h3></Link><p><Icon name="clock" />{collectionHours(game.minutes)}</p></div><AchievementRing game={game} /></div></article>;
}

function GamesPanel({ games, allGames, query, onQuery, platform, onPlatform, order, onOrder, visible, onMore, searchRef, target, gamesAction }) {
  const [view, setView] = useState('grid');
  let shown = filterCollection(games, query, platform, order === 'unlocked' ? 'name' : order);
  if (order === 'unlocked') shown.sort((a, b) => (gameAchievementSummary(b).unlocked ?? -1) - (gameAchievementSummary(a).unlocked ?? -1));
  return <section className="cp-games-panel"><div className="cp-section-heading"><div><p>UMA HISTÓRIA EM CADA CAPA</p><h2>Seus jogos <span>{allGames.length}</span></h2></div>{gamesAction || <span className="cp-games-caption">Só o que você realmente jogou</span>}</div><div className="cp-platform-filters" role="group" aria-label="Filtrar coleção por plataforma"><button type="button" aria-pressed={platform === 'all'} onClick={() => onPlatform('all')}><Icon name="globe" />Todos <b>{allGames.length}</b></button>{collectionProviders.map(provider => <button type="button" key={provider.key} disabled={!provider.available} aria-pressed={platform === provider.key} onClick={() => onPlatform(provider.key)}><img src={provider.icon} alt="" />{provider.label}{provider.available ? <b>{allGames.filter(game => game.platforms.some(row => row.provider === provider.key)).length}</b> : <small>Em breve</small>}</button>)}</div><div className="cp-game-toolbar"><label className="cp-game-search"><Icon name="search" /><span className="sr-only">Buscar jogo</span><input ref={searchRef} type="search" value={query} onChange={event => onQuery(event.target.value)} placeholder="Busque na sua coleção…" /><kbd>/</kbd></label><label className="cp-game-sort"><span className="sr-only">Ordenar jogos</span><select value={order} onChange={event => onOrder(event.target.value)}><option value="recent">Últimos jogados</option><option value="minutes">Mais horas</option><option value="unlocked">Mais conquistas</option><option value="name">A–Z</option></select></label><div className="cp-view-toggle" role="group" aria-label="Visualização dos jogos"><button type="button" aria-label="Visualizar em grade" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><Icon name="grid" /></button><button type="button" aria-label="Visualizar em lista" aria-pressed={view === 'list'} onClick={() => setView('list')}><Icon name="list" /></button></div></div><div className={`cp-games cp-games-${view}`}>{shown.slice(0, visible).map(game => <GameCard key={game.id} game={game} target={target} />)}</div>{!shown.length && <div className="cp-panel-empty"><Icon name="search" /><h3>{allGames.length ? 'Nenhum jogo corresponde aos filtros.' : 'Sua próxima história começa aqui.'}</h3><p>{allGames.length ? 'Experimente outro nome ou plataforma.' : 'Conecte sua Steam e sincronize para reunir os jogos que você já jogou.'}</p></div>}{shown.length > visible && <button className="cp-load-more" type="button" onClick={onMore}>Carregar mais 20 jogos <Icon name="plus" /><span>{Math.min(visible, shown.length)}/{shown.length}</span></button>}</section>;
}

function AchievementGames({ title, caption, games, empty, target }) {
  return <section className="cp-achievement-group"><div className="cp-section-heading"><div><p>{caption}</p><h2>{title}</h2></div><Icon name="trophy" /></div>{games.length ? <div>{games.map(game => { const progress = gameAchievementSummary(game); return <Link key={game.id} href={`${gamerGameHref(game,target)}${target?'&':'?'}tab=conquistas`}><div className="cp-small-cover"><CollectionPortrait game={game} decorative /></div><div><strong>{game.title}</strong><span>{progress.unlocked}/{progress.total} conquistas</span></div><AchievementRing game={game} compact /></Link>; })}</div> : <p className="cp-achievement-empty">{empty}</p>}</section>;
}

function AchievementsPanel({ data, badges, target }) {
  const known = data.games.filter(game => gameAchievementSummary(game).percent !== null);
  const most = [...known].sort((a, b) => gameAchievementSummary(b).unlocked - gameAchievementSummary(a).unlocked).slice(0, 4);
  const almost = known.filter(game => { const p = gameAchievementSummary(game); return p.percent >= 70 && !p.completed; }).sort((a, b) => gameAchievementSummary(b).percent - gameAchievementSummary(a).percent).slice(0, 4);
  return <div className="cp-achievement-panel"><div className="cp-section-heading"><div><p>UM DESAFIO DE CADA VEZ</p><h2>Conquistas</h2></div><span className="cp-games-caption">100% de conquistas ≠ campanha finalizada</span></div><div className="cp-achievement-columns"><AchievementGames title="Mais conquistas" caption="SEUS MAIORES FEITOS" games={most} target={target} empty="As conquistas aparecerão quando a plataforma disponibilizar seu progresso." /><AchievementGames title="Quase 100%" caption="A RETA FINAL" games={almost} target={target} empty="Nenhum jogo entre 70% e 99% das conquistas disponíveis." /></div><section className="cp-badges"><div className="cp-section-heading"><div><p>MARCAS DA SUA JORNADA</p><h2>Selos do void</h2></div><span>{badges.filter(badge => badge.unlocked).length}/{badges.length} desbloqueados</span></div><div>{badges.map(badge => <article key={badge.key} className={badge.unlocked ? 'is-unlocked' : ''}><span className="cp-badge-medal"><Icon name={badge.icon} /></span><div><h3>{badge.title}</h3><p>{badge.description}</p><small><Icon name={badge.unlocked ? 'check' : 'lock'} />{badge.unlocked ? 'Desbloqueado' : 'Em progresso'}</small></div></article>)}</div><p className="cp-badge-note">Selos visuais calculados com o seu histórico no VOID. Não são conquistas adicionais da Steam.</p></section></div>;
}

export default function CollectionMiniProfile({ data, loading, activeTab, onTab, busy, synchronize, privacy, query, onQuery, platform, onPlatform, order, onOrder, visible, onMore, children, achievementSpotlights, gamesAction, onSaveAppearance, readOnly=false }) {
  const searchRef=useRef(null), focusSearch=useRef(false), [picker,setPicker]=useState(null);
  const metadata=useGamerMetadata(data?.games||[]), target=readOnly?data?.profile?.user_id:null;
  useEffect(()=>{
    const search=event=>{
      if(picker||event.key!=='/'||event.ctrlKey||event.metaKey||event.altKey||event.target.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))return;
      event.preventDefault();event.stopPropagation();focusSearch.current=true;onTab('games');requestAnimationFrame(()=>{searchRef.current?.focus();if(searchRef.current)focusSearch.current=false;});
    };
    window.addEventListener('keydown',search,true);return()=>window.removeEventListener('keydown',search,true);
  },[onTab,picker]);
  useEffect(()=>{if(activeTab==='games'&&focusSearch.current){searchRef.current?.focus();focusSearch.current=false;}},[activeTab]);
  const badges=collectionBadges(data?.games||[],data?.stats);
  return <div className="cp-mini-profile" aria-busy={loading}>
    <ProfileHeader data={data} activeTab={activeTab} onTab={onTab} onChoose={setPicker} readOnly={readOnly}/>
    {data&&<><StatusStrip data={data} busy={busy} synchronize={synchronize} onGames={()=>onTab('games')} readOnly={readOnly} target={target}/><div className="cp-collection-meta">{readOnly?<span><Icon name="globe"/>Coleção compartilhada conforme a visibilidade do perfil.</span>:<><span><Icon name="refresh"/>Última sincronização: {data.lastSync?.finished_at?<time dateTime={data.lastSync.finished_at}>{dateTime(data.lastSync.finished_at)}</time>:'Ainda não concluída'}</span><label><Icon name={data.visibility==='private'?'lock':'globe'}/><span>Quem pode ver sua coleção e conquistas?</span><select disabled={busy} value={data.visibility} onChange={event=>privacy(event.target.value)}><option value="private">Somente eu</option><option value="public">Público, conforme meu perfil</option></select></label></>}</div></>}
    {children}
    {data&&tabs.map(([key])=><div key={key} id={`cp-panel-${key}`} role="tabpanel" aria-labelledby={`cp-tab-${key}`} hidden={key!==activeTab} tabIndex={0}>{activeTab===key&&(key==='overview'?<>
      <div className="cp-overview-layout"><RecentActivity data={data} onGames={()=>onTab('games')} metadata={metadata.items} target={target}/><aside className="cp-overview-aside"><section className="cp-about-panel"><p className="cp-overline">CADA JOGO, UMA HISTÓRIA</p><h2>{readOnly?'Uma jornada no PLAY':'Sua jornada no PLAY'}</h2><p>Tempo, desafios e descobertas que fazem parte de uma história gamer.</p><div><span><Icon name="globe"/>Plataformas conectadas</span><strong>{data.stats.connected??'—'}</strong></div>{!readOnly&&<><Link href="/jogos/biblioteca">Minha Biblioteca <Icon name="arrow-up-right"/></Link><small>Seus status e avaliações continuam do seu jeito.</small></>}</section><PlayedGenrePills games={data.games} metadata={metadata.items} loading={metadata.loading}/></aside></div>
      <div className="cp-overview-extras"><TopPlayedPanel games={data.games} target={target}/><section className="cp-mini-badges"><div><h2>Seus selos</h2><button type="button" onClick={()=>onTab('achievements')}>Ver todos <Icon name="arrow-right"/></button></div><div>{badges.map(badge=><span key={badge.key} tabIndex={0} className={badge.unlocked?'is-unlocked':''} title={`${badge.title} · ${badge.unlocked?'Desbloqueado':`Como desbloquear: ${badge.description}`}`}><Icon name={badge.icon}/><span className="sr-only">{badge.title}: {badge.unlocked?'Desbloqueado':badge.description}</span></span>)}</div><p>Passe pelos selos para descobrir cada desafio.</p></section></div>
    </>:key==='games'?<GamesPanel games={data.games} allGames={data.games} query={query} onQuery={onQuery} platform={platform} onPlatform={onPlatform} order={order} onOrder={onOrder} visible={visible} onMore={onMore} searchRef={searchRef} target={target} gamesAction={!readOnly?gamesAction:null}/>:<><AchievementsPanel data={data} badges={badges} target={target}/>{achievementSpotlights}</>)}</div>)}
    {loading&&!data&&<div className="cp-games cp-games-grid cp-loading" role="status" aria-label="Carregando sua coleção">{Array.from({length:5},(_,i)=><div className="cp-cover-skeleton" key={i}/>)}</div>}
    {picker&&!readOnly&&<GamerAppearancePicker field={picker} value={data.appearance?.[picker]} games={data.games} onSave={onSaveAppearance} onClose={()=>setPicker(null)}/>}
  </div>;
}
