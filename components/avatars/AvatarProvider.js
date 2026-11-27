import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAccount } from '../AccountProvider';
import { avatarIdentityStore } from '../../lib/avatar-identities';
import { AVATAR_CHANGED } from '../../lib/avatars';
import { profileIdValid } from '../../lib/profile';
const Context = createContext(null);
export default function AvatarProvider({ children }) {
  const { client } = useAccount(), store = useMemo(() => client ? avatarIdentityStore(client) : null, [client]);
  useEffect(() => {
    if (!store) return;
    const changed = event => { const { identity, avatar } = event.detail || {}; if (identity?.user_id) store.seed(identity.user_id, { user_id: identity.user_id, avatar_id: identity.avatar_id, avatar: avatar || null }); };
    const identityChanged = event => { const identity = event.detail; if (!identity?.user_id) return; if (identity.avatar_id === null) store.seed(identity.user_id, { user_id: identity.user_id, avatar_id: null, avatar: null }); else store.invalidate(identity.user_id); };
    const refresh = () => { if (document.visibilityState !== 'hidden') store.invalidate(); };
    window.addEventListener(AVATAR_CHANGED, changed); window.addEventListener('void:identity-changed', identityChanged); window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    const timer = setInterval(refresh, 60000);
    return () => { clearInterval(timer); window.removeEventListener(AVATAR_CHANGED, changed); window.removeEventListener('void:identity-changed', identityChanged); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [store]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useCharacterAvatar(profile) {
  const store = useContext(Context), [, tick] = useState(0), id = profile.user_id;
  useEffect(() => store?.subscribe(() => tick(n => n + 1)), [store]);
  const resolved = store && profileIdValid(id) ? store.get(id) : null;
  return profile.character_avatar || resolved?.avatar || null;
}
