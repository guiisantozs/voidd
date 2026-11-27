import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAccount } from '../components/AccountProvider';
import MovieHeader from '../components/movies/MovieHeader';
import { NotificationList } from '../components/notifications/Notifications';
import { useNotifications } from '../components/notifications/NotificationProvider';
import { notificationQuery } from '../lib/notifications';

export default function NotificationsPage() {
  const { user, client } = useAccount();
  const notifications = useNotifications();
  const [unread, setUnread] = useState(false), [limit, setLimit] = useState(20), [state, setState] = useState({}), [attempt, setAttempt] = useState(0);
  const owner = user?.id, tabs = useRef(null);
  useEffect(() => {
    if (!owner || !client) return;
    let active = true;
    setState(old => ({ ...old, loading: true, error: false }));
    const request = notificationQuery(client, owner, { unread }).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit + 1);
    request.then(({ data, error }) => { if (active) setState({ owner, unread, limit, rows: data?.slice(0, limit) || [], more: data?.length > limit, error: !!error }); }).catch(() => { if (active) setState({ owner, unread, limit, error: true }); });
    return () => { active = false; };
  }, [client, owner, unread, limit, notifications.revision, attempt]);
  const visible = state.owner === owner && state.unread === unread && state.limit===limit ? state : {};
  const select = value => { setUnread(value); setLimit(20); };
  function tabKeys(event) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const next = event.key === 'Home' ? false : event.key === 'End' ? true : !unread;
    select(next); tabs.current?.children[next ? 1 : 0]?.focus();
  }
  return <div className="movies-page"><Head><title>Notificações — VOID</title><meta name="robots" content="noindex" /></Head><MovieHeader /><main className="notifications-page"><h1>Notificações</h1>{!user ? <p><Link href="/conta">Entre na sua conta</Link> para ver suas notificações.</p> : <><div className="notification-actions"><div ref={tabs} role="tablist" aria-label="Filtrar notificações" onKeyDown={tabKeys}>{[false, true].map(value => <button key={String(value)} id={`notifications-tab-${value}`} role="tab" aria-selected={unread === value} aria-controls="notifications-content" tabIndex={unread === value ? 0 : -1} onClick={() => select(value)}>{value ? 'Não lidas' : 'Todas'}</button>)}</div><button disabled={!notifications.count} onClick={() => notifications.mutate('read')}>Marcar todas como lidas</button><Link href="/conta">Configurações</Link></div><section id="notifications-content" role="tabpanel" aria-labelledby={`notifications-tab-${unread}`}><NotificationList key={`${owner}:${unread}:${limit}`} autoRead rows={visible.rows || []} loading={visible.loading || !visible.rows && !visible.error} error={visible.error} retry={() => setAttempt(n => n + 1)} removable />{visible.more && <button disabled={visible.loading} onClick={() => setLimit(value => value + 20)}>Carregar mais</button>}</section></>}</main></div>;
}
