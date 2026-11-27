import { useEffect, useState } from 'react';
import { useAccount } from '../components/AccountProvider';
import { readAvatars } from './avatars';
export function useAvatars(mediaType, mediaId) {
  const { client } = useAccount(), [attempt, retry] = useState(0), [state, setState] = useState({ loading: true, rows: [], error: false });
  const scope = `${mediaType || ''}:${mediaId || ''}`;
  useEffect(() => {
    if (!client) { setState({ scope, loading: false, rows: [], error: false }); return; }
    const controller = new AbortController(); setState({ scope, loading: true, rows: [], error: false });
    readAvatars(client, { mediaType, mediaId, signal: controller.signal }).then(rows => { if (!controller.signal.aborted) setState({ scope, loading: false, rows, error: false }); }).catch(() => { if (!controller.signal.aborted) setState({ scope, loading: false, rows: [], error: true }); });
    return () => controller.abort();
  }, [client, scope, attempt]);
  return { ...(state.scope === scope ? state : { loading: true, rows: [], error: false }), retry: () => retry(n => n + 1) };
}
