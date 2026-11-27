import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Icon from '../Icon';
import { useAccount } from '../AccountProvider';
import { ProfileAvatar,ProfilePoster } from '../profile/ProfileUI';
import {socialRpc,socialError} from '../../lib/social-community';
import {listsChanged} from '../../lib/lists';
import { useNotifications } from './NotificationProvider';
import { groupNotifications, notificationHref, notificationText, notificationTypes,notificationReadSnapshot } from '../../lib/notifications';
import { connectionTime } from '../../lib/friends';

export function NotificationList({ rows, loading, error, quiet = false, removable = false, afterOpen,autoRead=false,openedAt }) {
  const { mutate, actionError,markLoadedRead,refresh } = useNotifications();
  const {client,user}=useAccount();
  const [inviteMessage,setInviteMessage]=useState('');
  const opening=useRef(openedAt??Date.now()),viewed=useRef(false);
  useEffect(()=>{
    if(!autoRead||viewed.current||loading||error||document.visibilityState==='hidden')return;
    viewed.current=true;
    const ids=notificationReadSnapshot(rows,opening.current);
    if(ids.length)markLoadedRead(ids);
  },[autoRead,rows,loading,error,markLoadedRead]);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const timer = setInterval(() => tick(n => n + 1), 60000); return () => clearInterval(timer); }, []);
  async function open(event, row) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault(); if (busy) return;
    setBusy(true);
    try {
      if (await mutate('read', row.ids)) { afterOpen?.(); await router.push(notificationHref(row)); }
    } finally { setBusy(false); }
  }
  return <div aria-busy={loading || busy}>
    <p className="notification-period">Últimas 24 horas</p>
    {!quiet && (error || actionError) && <p role="status">Não foi possível carregar suas notificações no momento.</p>}
    {loading && <div role="status" aria-label="Carregando notificações">{[1, 2, 3].map(i => <div key={i} className="notification-skeleton m-skeleton" />)}</div>}
    <ul className="notification-list">{groupNotifications(rows).map(row => <li key={row.id} className={!row.read_at ? 'notification-unread' : ''}>
      <a href={notificationHref(row)} onClick={event => open(event, row)}>
        <ProfileAvatar profile={{ user_id: row.actor_id, display_name: row.data?.actor_name || 'Void', avatar_url: row.data?.avatar_url }} lazySigning />
        <span className="notification-copy"><span>{notificationText(row)}</span><time dateTime={row.created_at}>{connectionTime(row.created_at)}</time>{!row.read_at && <small>Não lida</small>}</span>
        {row.type==='work_recommendation'&&row.data?.work?<span className="vs-notification-cover"><ProfilePoster item={row.data.work}/></span>:/^https:\/\/image\.tmdb\.org\/t\/p\//.test(row.data?.poster || '') && <img className="notification-poster" src={row.data.poster} alt="" loading="lazy" />}
      </a>
      {row.type==='work_recommendation'&&row.data?.message&&<p className="vs-notification-message">{row.data.message}</p>}
      {row.type==='list_invite'&&<div className="vs-notification-invite">{[['accept','Aceitar'],['decline','Recusar']].map(([action,label])=><button key={action} disabled={busy} onClick={async()=>{setBusy(true);setInviteMessage('');try{await socialRpc(client,'void_list_invitation',{target:row.entity_id,person:user.id,action});listsChanged();setInviteMessage(action==='accept'?'Convite aceito.':'Convite recusado.');refresh();if(action==='accept'){afterOpen?.();router.push('/listas/'+row.entity_id);}}catch(error){setInviteMessage(socialError(error));}finally{setBusy(false);}}}>{label}</button>)}</div>}
      {removable && <button disabled={busy} className="notification-delete" aria-label={`Apagar: ${notificationText(row)}`} onClick={async () => { setBusy(true); await mutate('delete', row.ids); setBusy(false); }}><Icon name="close" /></button>}
    </li>)}</ul><p role="status" aria-live="polite">{inviteMessage}</p>
  </div>;
}

export default function NotificationBell() {
  const { user } = useAccount();
  const notifications = useNotifications();
  const [open, setOpen] = useState(false);
  const [openedAt,setOpenedAt]=useState(0);
  const root = useRef(null), trigger = useRef(null), panel = useRef(null);
  const router = useRouter();
  useEffect(() => { setOpen(false); }, [router.asPath, user?.id]);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector('button, a')?.focus();
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const keys = event => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', keys);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keys); };
  }, [open]);
  if (!user) return null;
  const count = notifications.count || 0;
  return <div className="notification-bell" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} className="notification-trigger" aria-label={`Notificações: ${count} não lidas`} aria-expanded={open} aria-controls="notification-panel" onClick={() => { if (!open) {setOpenedAt(Date.now());notifications.refresh();} setOpen(value => !value); }}><Icon name="bell" />{count > 0 && <span className="notification-badge">{count > 9 ? '9+' : count}</span>}</button>
    <span className="notification-sr" role="status" aria-live="polite" aria-atomic="true">{count ? `${count} notificações não lidas` : ''}</span>
    {open && <section ref={panel} id="notification-panel" className="notification-panel" aria-label="Notificações recentes"><header><h2>Notificações</h2><button onClick={() => { setOpen(false); trigger.current?.focus(); }} aria-label="Fechar notificações"><Icon name="close" /></button></header><button disabled={!count} onClick={() => notifications.mutate('read')}>Marcar todas como lidas</button><NotificationList {...notifications} quiet autoRead openedAt={openedAt} afterOpen={() => setOpen(false)} /><Link href="/notificacoes">Ver todas</Link></section>}
  </div>;
}

export function NotificationPreferences() {
  const { client, user } = useAccount();
  const [state, setState] = useState({}), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [attempt, setAttempt] = useState(0);
  const owner = user?.id;
  useEffect(() => {
    if (!client || !owner) return;
    let active = true;
    client.from('notification_preferences').select('*').eq('user_id', owner).maybeSingle().then(({ data, error }) => {
      if (active) setState({ owner, data: error ? null : data || Object.fromEntries(Object.keys(notificationTypes).map(key => [key, true])), error: !!error });
    }).catch(() => { if (active) setState({ owner, error: true }); });
    return () => { active = false; };
  }, [client, owner, attempt]);
  if (!user) return null;
  const visible = state.owner === owner ? state : {};
  async function toggle(key, value) {
    setBusy(true); setMessage('');
    try {
      const { error } = await client.from('notification_preferences').upsert({ user_id: owner, [key]: value }, { onConflict: 'user_id' });
      if (error) throw error;
      setState(old => old.owner === owner ? { ...old, data: { ...old.data, [key]: value } } : old); setMessage('Preferência salva.');
    } catch { setMessage('Não foi possível salvar. Tente novamente.'); }
    finally { setBusy(false); }
  }
  return <section className="account-panel notification-preferences"><h2>Notificações</h2><p>Escolha quais avisos deseja receber no Void.</p>{visible.error ? <p role="status">Não foi possível carregar. <button onClick={() => setAttempt(n => n + 1)}>Tentar novamente</button></p> : !visible.data ? <div className="notification-skeleton m-skeleton" role="status" aria-label="Carregando preferências" /> : Object.entries(notificationTypes).map(([key, label]) => <label key={key}><span>{label}</span><input type="checkbox" role="switch" checked={visible.data[key]} disabled={busy} onChange={event => toggle(key, event.target.checked)} /></label>)}<p role="status">{message}</p><Link href="/notificacoes">Ver todas as notificações</Link></section>;
}
