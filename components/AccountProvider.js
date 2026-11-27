import NotificationProvider from './notifications/NotificationProvider';
import UsernameGate from './profile/UsernameGate';
import PeopleMenuSearch from './profile/PeopleSearch';
import HeaderAccount from './HeaderAccount';
import Icon from './Icon';
import PendingFriendInvite from './friends/PendingFriendInvite';
import AvatarProvider from './avatars/AvatarProvider';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getSupabase } from '../lib/supabase';
import { DATA_EVENT, importGuest, setStorageUser, syncAccount } from '../lib/account-storage';
import { createSyncQueue } from '../lib/account-sync';
import { currentAccountStorage, pruneAccountCache } from '../lib/account-cache-lifecycle';
import { markRecovery, recoveryPending, RECOVERY_KEY } from '../lib/account-auth';

const Context = createContext(null);
export const useAccount = () => useContext(Context);

export default function AccountProvider({ children }) {
  const [client, setClient] = useState(null);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const [navigationElement, setNavigationElement] = useState(null);
  useEffect(() => {
    const navigation = navigationElement;
    if (!navigation) return;
    // Visual spacing only: allow the page background to continue behind the menu.
    const measure = () => document.documentElement.style.setProperty('--site-navigation-height', `${navigation.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(navigation);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--site-navigation-height'); };
  }, [navigationElement]);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [recovery, setRecovery] = useState(false);
  const userRef = useRef(null);
  const syncRunner = useRef(null);
  const syncRequest = useRef(0);
  const recoveryUser = useRef(null);
  const boot = useRef(0);
  const needsPull = useRef(false);
  const [identity, setIdentity] = useState(null);
  const ownProfile = identity?.user_id === user?.id ? identity : null;
  useEffect(() => {
    if (!client || !user) { setIdentity(null); return; }
    let active = true, generation = 0;
    async function refresh() {
      const request = ++generation;
      try {
        const { data, error: issue } = await client.from('void_community_profiles').select('user_id,display_name,username,avatar_url,avatar_id').eq('user_id', user.id).maybeSingle();
        if (active && request === generation && !issue) setIdentity(data);
      } catch { /* A failed identity refresh does not block the account. */ }
    }
    function changed(event) {
      if (event.detail?.user_id === user.id) { generation++; setIdentity(old=>({...((old?.user_id===user.id&&old)||{}),...event.detail})); }
      else refresh();
    }
    refresh();
    window.addEventListener('void:identity-changed', changed);
    window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('void:identity-changed', changed); window.removeEventListener('focus', refresh); };
  }, [client, user?.id]);
  useEffect(() => {
    let service;
    try { service = getSupabase(); setClient(service); }
    catch { setError('A configuração da conta está inválida.'); setReady(true); return; }
    if (!service) { setStorageUser(null); setReady(true); return; }
    const runSync = createSyncQueue((id, pull) => {
      if (userRef.current?.id !== id) throw new Error('A conta mudou antes da sincronização.');
      const generation = boot.current;
      const storage = currentAccountStorage(localStorage, () => userRef.current?.id === id && boot.current === generation);
      return syncAccount(service, storage, id, pull);
    });
    syncRunner.current = runSync;
    let alive = true;
    let identity;
    async function accept(session) {
      const next = session?.user || null;
      const nextIdentity = next?.id || 'guest';
      if (identity === nextIdentity) {
        userRef.current = next;
        setUser(next);
        return;
      }
      identity = nextIdentity;
      const previousId = userRef.current?.id;
      const token = ++boot.current;
      if (previousId && previousId !== next?.id) {
        try { pruneAccountCache(localStorage, previousId); }
        catch { /* Preserve unreadable pending work; never log private cache. */ }
      }
      setReady(false); setError(''); setSyncing(false);
      userRef.current = next;
      setStorageUser(next?.id);
      setUser(next);
      let restoringRecovery = recoveryUser.current === next?.id && !!next;
      try { restoringRecovery ||= recoveryPending(sessionStorage, next?.id); } catch { /* Session storage may be unavailable. */ }
      setRecovery(restoringRecovery);
      needsPull.current = !!next;
      if (next) {
        try { await runSync(next.id, true); if (alive && token === boot.current) needsPull.current = false; }
        catch { if (token === boot.current) setError('Não foi possível sincronizar. Você pode continuar com a cópia deste navegador e tentar novamente em Conta.'); }
      }
      if (alive && token === boot.current) setReady(true);
    }
    const { data: listener } = service.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        recoveryUser.current = session?.user?.id || null;
        try { markRecovery(sessionStorage, recoveryUser.current); } catch { /* Recovery still works in this mount. */ }
        setRecovery(true);
      }
      if (event === 'SIGNED_OUT') {
        recoveryUser.current = null;
        try { sessionStorage.removeItem(RECOVERY_KEY); } catch { /* No tokens are stored in this UI flag. */ }
        setRecovery(false);
      }
      // Não aguarda operações Supabase dentro do callback de autenticação.
      setTimeout(() => { if (alive) accept(session); }, 0);
    });
    service.auth.getSession().then(({ data, error: issue }) => {
      if (!alive) return;
      if (issue) { setError('Não foi possível recuperar sua sessão.'); setReady(true); }
      else if (identity === undefined) accept(data.session);
    }).catch(() => { if (alive) { setError('Não foi possível recuperar sua sessão. Tente recarregar a página.'); setReady(true); } });
    return () => { alive = false; boot.current++; if (syncRunner.current === runSync) syncRunner.current = null; listener.subscription.unsubscribe(); };
  }, []);
  async function synchronize(pull = false) {
    if (!client || !userRef.current || !syncRunner.current) return;
    const id = userRef.current.id;
    const token = boot.current;
    const request = ++syncRequest.current;
    setSyncing(true); setError('');
    const download = pull || needsPull.current;
    return syncRunner.current(id, download).then(() => {
      if (userRef.current?.id === id && token === boot.current) { needsPull.current = false; if (download) setRevision(value => value + 1); }
    }).catch((issue) => {
      if (userRef.current?.id === id && token === boot.current) setError('Sincronização pendente. Seus registros estão salvos neste navegador. Tente novamente em Conta.');
      if(issue?.code==='MOVIE_RELEASE')throw issue;
      throw new Error('Sincronização pendente.');
    }).finally(() => { if (token === boot.current && request === syncRequest.current) setSyncing(false); });
  }
  useEffect(() => {
    if (!user || !ready) return;
    const retry = () => { synchronize().catch(() => {}); };
    const timer = setInterval(retry, 15000);
    window.addEventListener(DATA_EVENT, retry);
    window.addEventListener('online', retry);
    return () => { clearInterval(timer); window.removeEventListener(DATA_EVENT, retry); window.removeEventListener('online', retry); };
  }, [user?.id, ready, client]);
  async function importLocal() {
    if (!user) return 0;
    const count = importGuest(localStorage, user.id);
    await synchronize(true);
    return count;
  }
  async function refreshUser() {
    if (!client || !userRef.current) return null;
    const id = userRef.current.id;
    const { data, error: issue } = await client.auth.getUser();
    if (issue) throw issue;
    if (data.user?.id === id && userRef.current?.id === id) { userRef.current = data.user; setUser(data.user); }
    return data.user;
  }
  function finishRecovery() {
    recoveryUser.current = null;
    try { sessionStorage.removeItem(RECOVERY_KEY); } catch { /* UI flag only. */ }
    setRecovery(false);
  }
  const value = { client, user, ready, error, syncing, synchronize, importLocal, recovery, finishRecovery, refreshUser, ownProfile };
  return <Context.Provider value={value}><AvatarProvider><NotificationProvider><PendingFriendInvite/><UsernameGate>{!ready ? <div className="account-loading" role="status">Carregando sua conta…</div> : <><div className="account-bar site-navigation" ref={setNavigationElement}><div className="account-bar-links"><Link href="/" className="logo account-bar-logo" aria-label="Void — início">void<span><Icon name="dot"/></span></Link><Link href={user ? '/' : '/conta'}>{user ? 'Início' : 'Entrar / criar conta'}</Link><PeopleMenuSearch/></div><div className="account-bar-right"><span className="account-bar-status">{user ? syncing ? 'Sincronizando…' : error ? 'Sincronização pendente' : 'Conta conectada' : 'Modo visitante · salvo neste navegador'}</span><HeaderAccount/></div></div>{error && <div className="account-global-error" role="status">{error} <Link href="/conta">Ver conta</Link></div>}<div className="site-content" key={`${user?.id || 'guest'}:${revision}`}>{children}</div></>}</UsernameGate></NotificationProvider></AvatarProvider></Context.Provider>;
}
