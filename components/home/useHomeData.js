import {createRefreshQueue} from '../../lib/refresh-queue';
import { useEffect, useState } from 'react';
import { useAccount } from '../AccountProvider';
import { loadCommunityReviews } from '../../lib/community-reviews';
import { loadFriendMovieCards } from '../../lib/friend-movie-cards';
import { feedMovies } from '../../lib/movie-community';
import { listsPage, LISTS_EVENT } from '../../lib/lists';
import { loadConnections, CONNECTIONS_EVENT } from '../../lib/friends';
import { homeWeeklyReviews } from '../../lib/home-catalog';

// Homepage composition of existing authorized APIs. Private responses never enter a shared cache.
export default function useHomeData(enabled = true) {
  const { client, user } = useAccount(), scope = user?.id || 'guest';
  const [state, setState] = useState({}), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    if (!client) { setState({ scope, community: { error: true }, friends: { error: true }, lists: { error: true }, connections: { error: true } }); return; }
    const abort = new AbortController();
    setState({ scope });
    const apply = (key, value) => { if (!abort.signal.aborted) setState(old => ({ ...old, scope, [key]: value })); };
    const queues = new Map();
    const task = (key, request) => {
      const queue = createRefreshQueue(() => Promise.resolve().then(request).then(value => apply(key, value)).catch(() => apply(key, { error: true })));
      queues.set(key, queue); queue.refresh();
    };
    task('community', async () => {
      const data = await loadCommunityReviews(client, { signal: abort.signal });
      return { rows: homeWeeklyReviews(data.rows) };
    });
    if (user) {
      task('friends', async () => {
        const { data, error } = await client.rpc('void_friend_movies').abortSignal(abort.signal);
        if (error) throw error;
        const movies = feedMovies([...(data?.movies || [])].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6));
        return { movies: await loadFriendMovieCards(client, movies, abort.signal) };
      });
      task('lists', () => listsPage(client, { signal: abort.signal }));
      task('connections', () => loadConnections(client, user.id, abort.signal));
    }
    let timer, dirty = new Set();
    const refresh = event => {
      // Connection reconciliation also rechecks public review visibility under
      // RLS. A list edit alone does not invalidate reviews or friendships.
      const keys = event.type === LISTS_EVENT ? ['lists'] : ['friends', 'connections', 'community'];
      keys.forEach(key => dirty.add(key)); clearTimeout(timer);
      timer = setTimeout(() => {
        if (document.visibilityState === 'visible') dirty.forEach(key => queues.get(key)?.refresh({changed:true}));
        dirty.clear();
      }, 800);
    };
    window.addEventListener(LISTS_EVENT, refresh); window.addEventListener(CONNECTIONS_EVENT, refresh);
    return () => { abort.abort(); queues.forEach(queue => queue.dispose()); clearTimeout(timer); window.removeEventListener(LISTS_EVENT, refresh); window.removeEventListener(CONNECTIONS_EVENT, refresh); };
  }, [client, scope, attempt, enabled]);
  return { ...(state.scope === scope ? state : {}), retry: () => setAttempt(value => value + 1) };
}
