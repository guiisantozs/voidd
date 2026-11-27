import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {createRefreshQueue} from '../../lib/refresh-queue';
import { useAccount } from '../AccountProvider';
import { CONNECTIONS_EVENT } from '../../lib/friends';
import { notificationPeriod, notificationQuery,markNotificationSnapshot } from '../../lib/notifications';

const Context = createContext(null);
export const useNotifications = () => useContext(Context);

export default function NotificationProvider({ children }) {
  const { client, user, ready } = useAccount();
  const owner = user?.id;
  const [state, setState] = useState({});
  const generation = useRef(0);
  const current = useRef(owner); current.current = owner;
  const read = useCallback(async () => {
    if (!client || !owner || !ready) return;
    const request = ++generation.current;
    try {
      const now = Date.now();
      const [recent, unread] = await Promise.all([
        notificationQuery(client, owner, { now }).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(10),
        notificationQuery(client, owner, { now, count: true, unread: true }),
      ]);
      if (recent.error || unread.error) throw recent.error || unread.error;
      if (current.current === owner && request === generation.current) setState(old => ({ owner, rows: recent.data, count: unread.count || 0, revision: (old.revision || 0) + 1 }));
    } catch {
      if (current.current === owner && request === generation.current) setState(old => ({ ...(old.owner === owner ? old : {}), owner, error: true }));
    }
  }, [client, owner, ready]);
  const queue = useMemo(() => createRefreshQueue(read), [read]);
  const refresh = useCallback(() => queue.refresh({changed:true}), [queue]);

  useEffect(() => {
    if (!client || !owner || !ready) return;
    let timer, started = false, active = true;
    const start = () => { if (active && !started) { started = true; queue.refresh(); } };
    const fallback = setTimeout(start, 1000);
    const schedule = () => { if (!active) return; clearTimeout(timer); timer = setTimeout(() => queue.refresh({changed:true}), 120); };
    const socialChanged = () => { window.dispatchEvent(new CustomEvent(CONNECTIONS_EVENT, { detail: { user_id: owner, silent: true } })); schedule(); };
    const visible = () => { if (document.visibilityState === 'visible') { schedule(); socialChanged(); } };
    const channel = client.channel(`notifications:${owner}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${owner}` }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'void_friendships', filter: `recipient=eq.${owner}` }, socialChanged)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'void_friendships', filter: `sender=eq.${owner}` }, socialChanged)
      .subscribe(status => { if (status === 'SUBSCRIBED') { if (started) schedule(); else start(); } else if (['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)) start(); });
    window.addEventListener('focus', visible);
    window.addEventListener('online', visible);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener(CONNECTIONS_EVENT, schedule);
    // Deletes are not filterable reliably in Postgres Changes. The visible-tab
    // poll also reconciles revocations of review/profile access and undone actions.
    const poll = setInterval(() => { if (document.visibilityState === 'visible') { schedule(); socialChanged(); } }, 30000);
    return () => {
      active = false; generation.current++; queue.cancelTrailing(); clearTimeout(fallback); clearTimeout(timer); clearInterval(poll); client.removeChannel(channel);
      window.removeEventListener('focus', visible); window.removeEventListener('online', visible); document.removeEventListener('visibilitychange', visible);
      window.removeEventListener(CONNECTIONS_EVENT, schedule);
    };
  }, [client, owner, ready, queue]);

  const mutate = async (action, ids) => {
    if (!client || !owner) return false;
    setState(old => old.owner === owner ? { ...old, actionError: false } : old);
    let request = action === 'delete' ? client.from('notifications').delete() : client.from('notifications').update({ read_at: new Date().toISOString() });
    request = request.eq('user_id', owner);
    if (ids) request = request.in('id', ids);
    else {
      const period = notificationPeriod();
      request = request.is('read_at', null).gte('created_at', period.since).lte('created_at', period.until);
    }
    try { const { error } = await request; if (error) throw error; await refresh(); return current.current === owner; }
    catch { if (current.current === owner) setState(old => ({ ...old, actionError: true })); return false; }
  };
  const markLoadedRead=useCallback(async ids=>{
    if(!client||!owner||current.current!==owner||!ids.length)return;
    try{
      const changed=await markNotificationSnapshot(client,owner,ids);
      if(current.current!==owner)return;
      generation.current++;
      const seen=new Set(changed),readAt=new Date().toISOString();
      setState(old=>old.owner===owner?{...old,actionError:false,rows:old.rows?.map(row=>seen.has(row.id)?{...row,read_at:row.read_at||readAt}:row),count:Math.max(0,(old.count||0)-changed.length)}:old);
      await refresh();
    }catch{if(current.current===owner)setState(old=>({...old,actionError:true}));}
  },[client,owner,refresh]);
  const visible = state.owner === owner ? state : {};
  return <Context.Provider value={{ ...visible, rows: visible.rows || [], loading: !!owner && !visible.rows && !visible.error, refresh, mutate,markLoadedRead }}>{children}</Context.Provider>;
}
