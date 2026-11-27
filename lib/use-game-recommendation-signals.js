import { useEffect, useState } from 'react';
import { useAccount } from '../components/AccountProvider';
import { readReviews } from './catalog';
import { DATA_EVENT } from './account-storage';
import { gamePreferences } from './game-recommendations';
import { gameFriendSignals } from './game-recommendation-friends';

const emptyPreferences = { played: [], genres: [] };
export function useGameRecommendationSignals(enabled) {
  const { client, user } = useAccount(), owner = user?.id || 'guest';
  const [preferences, setPreferences] = useState({ owner: null, value: emptyPreferences });
  const [friends, setFriends] = useState({ owner: null, rows: [], games: [], error: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => { try { setPreferences({ owner, value: gamePreferences(readReviews()) }); } catch { setPreferences({ owner, value: emptyPreferences }); } };
    refresh(); window.addEventListener(DATA_EVENT, refresh); window.addEventListener('storage', refresh); window.addEventListener('focus', refresh);
    return () => { window.removeEventListener(DATA_EVENT, refresh); window.removeEventListener('storage', refresh); window.removeEventListener('focus', refresh); };
  }, [enabled, owner]);
  useEffect(() => {
    if (!enabled || !client || !user) return;
    let controller, alive = true;
    async function refresh() {
      controller?.abort(); controller = new AbortController(); const signal = controller.signal;
      // Drop old social signals before revalidating visibility/friendship access.
      setFriends({ owner, rows: [], games: [], error: false });
      try {
        const rows = await gameFriendSignals(client, signal);
        const results = await Promise.allSettled(rows.map(async row => {
          const response = await fetch(`/api/obra?categoria=jogos&id=${row.item.id}`, { signal });
          if (!response.ok) throw new Error('CATALOG');
          return (await response.json()).obra;
        }));
        if (alive && !signal.aborted) setFriends({ owner, rows, games: results.filter(result => result.status === 'fulfilled' && result.value?.categoria === 'jogos').map(result => result.value), error: false });
      } catch { if (alive && !signal.aborted) setFriends({ owner, rows: [], games: [], error: true }); }
    }
    refresh();
    const focus = () => { if (!document.hidden) refresh(); };
    const timer = setInterval(focus, 60000);
    window.addEventListener('focus', focus); document.addEventListener('visibilitychange', focus);
    return () => { alive = false; controller?.abort(); clearInterval(timer); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); };
  }, [enabled, client, user?.id, attempt]);
  const social = user && friends.owner === owner ? friends : { rows: [], games: [], error: false };
  return { preferences: preferences.owner === owner ? preferences.value : emptyPreferences, friends: social.rows, friendGames: social.games, socialError: social.error, retrySocial: () => setAttempt(value => value + 1) };
}
