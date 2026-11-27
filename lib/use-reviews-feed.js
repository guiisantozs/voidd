import { useEffect, useRef, useState } from 'react';
import { CONNECTIONS_EVENT } from './friends';
import { feedVisitKey, loadReviewsFeed, mergeFeedRows } from './reviews-feed';

export function useReviewsFeed(client, owner, filters, ready, media) {
  const [revision, setRevision] = useState(0), [state, setState] = useState({});
  const visit = useRef({}), request = useRef(null), live = useRef('');
  const scope = JSON.stringify([owner || 'guest', filters, revision, media]);
  live.current = scope;
  const login = filters.tab === 'amigos' && !owner;
  useEffect(() => {
    if (!ready || login) return;
    const controller = new AbortController(); request.current = controller;
    const visitKey = feedVisitKey(owner, filters.tab, media);
    if (!Object.hasOwn(visit.current, visitKey)) {
      let seenAt = null;
      try { const value = localStorage.getItem(visitKey); if (value && Number.isFinite(Date.parse(value))) seenAt = value; } catch { /* Optional visit marker. */ }
      visit.current[visitKey] = { seenAt, anchor: new Date().toISOString() };
    }
    const stamp = visit.current[visitKey];
    setState({ scope, loading: true });
    loadReviewsFeed(client, { media, filters, anchor: stamp.anchor, seenAt: stamp.seenAt, signal: controller.signal })
      .then(data => {
        if (controller.signal.aborted || live.current !== scope) return;
        setState({ scope, ...data });
        try { localStorage.setItem(visitKey, stamp.anchor); } catch { /* Feed works without browser storage. */ }
      }).catch(() => { if (!controller.signal.aborted && live.current === scope) setState({ scope, error: true }); });
    return () => { controller.abort(); request.current?.abort(); };
  }, [client, scope, ready, login]);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener(CONNECTIONS_EVENT, refresh);
    return () => window.removeEventListener(CONNECTIONS_EVENT, refresh);
  }, []);
  useEffect(() => () => { live.current = ''; request.current?.abort(); }, []);
  const feed = state.scope === scope ? state : { loading: true };
  async function more() {
    if (!feed.cursor || feed.moreLoading || request.current?.more) return;
    const controller = new AbortController(); controller.more = true; request.current = controller;
    setState(old => ({ ...old, moreLoading: true, moreError: false }));
    try {
      const data = await loadReviewsFeed(client, { media, filters, cursor: feed.cursor, anchor: feed.anchor, signal: controller.signal });
      if (!controller.signal.aborted && live.current === scope) setState(old => ({ ...old, rows: mergeFeedRows(old.rows, data.rows), cursor: data.cursor, has_more: data.has_more, moreLoading: false }));
    } catch { if (!controller.signal.aborted && live.current === scope) setState(old => ({ ...old, moreLoading: false, moreError: true })); }
    finally { if (request.current === controller) request.current = null; }
  }
  function refresh() {
    request.current?.abort();
    const key = feedVisitKey(owner, filters.tab, media);
    visit.current[key] = { ...visit.current[key], anchor: new Date().toISOString() };
    setRevision(value => value + 1);
  }
  return { ...feed, seenAt: visit.current[feedVisitKey(owner, filters.tab, media)]?.seenAt, login, more, refresh };
}
