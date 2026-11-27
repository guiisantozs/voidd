import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAccount } from './AccountProvider';
import Icon from './Icon';
import { setReaction } from '../lib/reactions';

export default function LikeButton({ listId, reviewUser, itemKey, likes = 0, liked = false, unavailable = false, hideCount = false }) {
  const { user, client } = useAccount(), owner = user?.id;
  const scope = `${owner || 'guest'}:${listId || `${reviewUser}:${itemKey}`}`;
  const current = useRef(scope), lock = useRef(false);
  current.current = scope;
  const [state, setState] = useState({ scope, likes: Number(likes), liked, busy: false, error: '' });
  useEffect(() => { lock.current = false; setState({ scope, likes: Number(likes), liked, busy: false, error: '' }); }, [scope, likes, liked]);
  useEffect(() => () => { current.current = null; }, []);
  const visible = state.scope === scope ? state : { likes: Number(likes), liked, busy: false };
  async function toggle() {
    if (lock.current || !owner || !client) return;
    lock.current = true;
    setState(old => ({ ...old, busy: true, error: '' }));
    try {
      await setReaction(client, owner, { listId, reviewUser, itemKey }, !visible.liked);
      if (current.current !== scope) return;
      setState({ scope, liked: !visible.liked, likes: Math.max(0, visible.likes + (visible.liked ? -1 : 1)), busy: false, error: '' });
    } catch (error) {
      if (current.current === scope) setState(old => ({ ...old, busy: false, error: error?.message?.includes('RATE_LIMIT') || error?.message?.includes('Limite de envios') ? 'Aguarde um minuto para curtir novamente.' : 'Não foi possível curtir. Tente novamente.' }));
    } finally { if (current.current === scope) lock.current = false; }
  }
  const countLabel = count => Number(count) === 1 ? 'curtida' : 'curtidas';
  const label = `${visible.liked ? 'Descurtir' : 'Curtir'} ${listId ? 'lista' : 'avaliação'}`;
  return <span className="void-like-control">{!owner ? <Link className="void-like-button" href="/conta" aria-label={`Entre para curtir ${listId ? 'esta lista' : 'esta avaliação'}`}><Icon name="heart"/><span>{hideCount?'Curtir':<>{Number(likes)} <span className="void-like-label">{countLabel(likes)}</span></>}</span></Link> : <button type="button" className="void-like-button" aria-label={`${label} · ${visible.likes} ${countLabel(visible.likes)}`} aria-pressed={visible.liked} disabled={visible.busy || unavailable} onClick={toggle}><Icon name="heart"/><span>{hideCount?(visible.liked?'Curtiu':'Curtir'):<>{visible.likes} <span className="void-like-label">{countLabel(visible.likes)}</span></>}</span></button>}{unavailable && <small role="status">Curtidas indisponíveis</small>}<small role="status" aria-live="polite">{visible.error}</small></span>;
}
