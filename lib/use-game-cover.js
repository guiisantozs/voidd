import { useEffect, useState } from 'react';
import { gameCoverClient, gameCoverId, officialGameCover } from './game-cover-client';
export function useGameCover(item, { enabled = true, preferSeed = true, priority = false } = {}) {
  const id = gameCoverId(item.id), seed = preferSeed ? officialGameCover(item.officialCover) : null, [attempt, setAttempt] = useState(0);
  const key = `${id || ''}:${seed?.url || ''}`;
  const initial = () => { const entry = gameCoverClient.peek(id); return { key, loading: !!id && !seed && !entry, data: seed ? { cover: seed } : entry?.data, error: !!entry?.error }; };
  const [state, setState] = useState(initial), current = state.key === key ? state : initial();
  useEffect(() => {
    if (seed && !attempt) { setState({ key, data: { cover: seed }, loading: false, error: false }); return; }
    if (!id) { setState({key,data:{cover:seed},loading:false,error:false});return; }
    if (!enabled) return;
    let alive = true; const cached = attempt ? null : gameCoverClient.peek(id);
    setState({ key, loading: !cached, data: cached?.data, error: !!cached?.error });
    gameCoverClient.load(id, { force: attempt > 0, priority }).then(entry => { if (alive) setState({ key, ...entry, loading: false }); });
    return () => { alive = false; };
  }, [key, enabled, attempt, priority]);
  return { ...current, retry: () => setAttempt(n => n + 1) };
}
