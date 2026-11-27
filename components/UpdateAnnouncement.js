import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import { useAccount } from './AccountProvider';
import DetailModal from './movies/DetailModal';
import Icon from './Icon';
import { ProfileAvatar } from './profile/ProfileUI';
import { CharacterPortrait } from './avatars/AvatarPicker';
import { useAvatars } from '../lib/use-avatars';
import { currentUpdate } from '../updates.config';
import { markUpdateSeen, shouldShowUpdate, updateSeenKey } from '../lib/update-announcements';

function localUpdateStorage() { try { return window.localStorage; } catch { return null; } }

export default function UpdateAnnouncement({ update = currentUpdate }) {
  const { user, ready, recovery } = useAccount();
  const router = useRouter();
  const owner = user?.id, key = updateSeenKey(update, owner);
  const [opened, setOpened] = useState(null);
  useEffect(() => {
    setOpened(null);
    if (!ready || !owner || recovery || !shouldShowUpdate(localUpdateStorage(), update, owner)) return;
    let cancelled = false, timer;
    const offer = () => {
      if (cancelled || !shouldShowUpdate(localUpdateStorage(), update, owner)) return;
      const anotherDialog = [...document.querySelectorAll('[role="dialog"]')].some(node => node.getClientRects().length);
      if (document.visibilityState === 'hidden' || anotherDialog || document.querySelector('.void-level-up')) { timer = setTimeout(offer, 500); return; }
      setOpened(key);
    };
    timer = setTimeout(offer, Math.max(0, Number(update.delay) || 1000));
    const viewedElsewhere = event => { if (event.key === key && event.newValue) { cancelled = true; clearTimeout(timer); setOpened(null); } };
    window.addEventListener('storage', viewedElsewhere);
    return () => { cancelled = true; clearTimeout(timer); window.removeEventListener('storage', viewedElsewhere); };
  }, [owner, ready, recovery, update.id, update.version, update.enabled, update.delay, key]);

  function dismiss() { markUpdateSeen(localUpdateStorage(), update, owner); setOpened(null); }
  function explore() {
    dismiss();
    if (typeof update.destination === 'string' && update.destination.startsWith('/') && !update.destination.startsWith('//')) router.push(update.destination).catch(() => {});
  }
  if (!ready || !owner || recovery || !key || opened !== key || update.enabled === false) return null;
  return createPortal(<UpdateCard update={update} onClose={dismiss} onExplore={explore} />, document.body);
}

function AvatarPreview() {
  const catalog = useAvatars();
  const avatars = catalog.rows.slice(0, 6);
  return <div className="vu-avatar-preview" aria-label="Prévia dos novos avatares">{avatars.length ? <div>{avatars.map(avatar => <CharacterPortrait avatar={avatar} key={avatar.id} />)}</div> : <><div aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <span key={i} className={`vu-avatar-placeholder ${catalog.loading ? 'is-loading' : ''}`}><Icon name="user" /></span>)}</div>{catalog.error && <small>Explore os avatares disponíveis no seu perfil.</small>}</>}</div>;
}

function UpdateCard({ update, onClose, onExplore }) {
  const primary = useRef(null);
  return <DetailModal title={update.title} className="vu-modal" backdropClassName="vu-backdrop" initialFocusRef={primary} inertBackground ariaDescribedBy="void-update-description" onClose={onClose}>
    <div className="vu-cover-background" aria-hidden="true">{update.visual?.covers?.map(cover => <img key={cover.appid} src={`https://cdn.akamai.steamstatic.com/steam/apps/${cover.appid}/header.jpg`} alt="" />)}</div>
    <div className="vu-content"><div className="vu-copy"><span className="vu-badge"><span />{update.badge}</span><p className="vu-overline">UM NOVO CAPÍTULO NO SEU UNIVERSO</p><h2>{update.title}</h2><p id="void-update-description" className="vu-subtitle">{update.subtitle}</p><ul className="vu-features">{update.items.map(item => <li key={item.id}><span className="vu-feature-icon"><Icon name={item.icon} /></span><div><h3>{item.title}</h3><p>{item.description}</p>{item.preview === 'avatars' && <AvatarPreview />}</div></li>)}</ul></div>{update.visual && <GamerPreview visual={update.visual} />}</div>
    <footer className="vu-actions"><button ref={primary} type="button" className="vu-primary" onClick={onExplore}>{update.primaryLabel}<Icon name="arrow-up-right" /></button><button type="button" className="vu-later" onClick={onClose}>{update.dismissLabel}</button></footer><p className="vu-footer-note"><Icon name="sparkle" />Mais espaço para as histórias que fazem parte de você.</p>
  </DetailModal>;
}

function GamerPreview({ visual }) {
  const { ownProfile, user } = useAccount();
  const profile = ownProfile || { display_name: user?.user_metadata?.display_name || 'Seu perfil gamer' };
  return <aside className="vu-visual" aria-label="Prévia visual da nova página gamer"><p className="vu-visual-label"><Icon name="gamepad" />{visual.label}</p><div className="vu-profile-preview" aria-hidden="true"><div className="vu-preview-banner">{visual.covers?.[0] && <img src={`https://cdn.akamai.steamstatic.com/steam/apps/${visual.covers[0].appid}/header.jpg`} alt="" />}<span>void <b>PLAY</b></span></div><div className="vu-preview-identity"><span className="vu-preview-avatar"><ProfileAvatar profile={profile} fallback="void" /><span><Icon name="diamond" /></span></span><strong>{profile.display_name || 'Seu perfil gamer'}</strong><small>Seu nível. Suas conquistas.</small><div className="vu-preview-xp"><span /></div></div><div className="vu-preview-tabs"><span>Visão geral</span><span>Jogos</span><span>Conquistas</span></div><div className="vu-preview-covers">{visual.covers?.map(cover => <div key={cover.appid}><img src={`https://cdn.akamai.steamstatic.com/steam/apps/${cover.appid}/library_600x900.jpg`} alt="" loading="lazy" /><span><Icon name="trophy" /></span></div>)}</div><div className="vu-preview-activity"><span><Icon name="clock" /></span><div><i /><i /></div><Icon name="arrow-up-right" /></div></div><div className="vu-floating-chip"><span><Icon name="trophy" /></span><div><strong>Sua jornada gamer</strong><small>Em um só lugar.</small></div><Icon name="check" /></div><h3>{visual.title}</h3><p>Uma prévia do que está esperando por você.</p></aside>;
}
