import { useRouteTab } from '../../lib/use-route-tab';
import { useId } from 'react';
import { useAvatars } from '../../lib/use-avatars';
import WorkAvatars from './WorkAvatars';
export default function WorkAvatarLayout({ item, children }) {
  const catalog = useAvatars(item.categoria, item.id), id = useId();
  const [active,select]=useRouteTab(['overview','avatares'],'overview','tab');
  if (!catalog.rows.length) return children;
  return <><div className="va-work-tabs" role="tablist" aria-label="Informações da obra" onKeyDown={event => { if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 'overview' : event.key === 'End' ? 'avatares' : active === 'overview' ? 'avatares' : 'overview'; select(next); document.getElementById(`${id}-${next}`)?.focus(); }}>{[['overview', 'Visão geral'], ['avatares', `Avatares ${catalog.rows.length}`]].map(([key, label]) => <button type="button" key={key} role="tab" id={`${id}-${key}`} aria-selected={active === key} tabIndex={active === key ? 0 : -1} aria-controls={`${id}-panel-${key}`} onClick={() => select(key)}>{label}</button>)}</div><div id={`${id}-panel-overview`} role="tabpanel" aria-labelledby={`${id}-overview`} hidden={active !== 'overview'}>{children}</div><div className="va-work-panel" id={`${id}-panel-avatares`} role="tabpanel" aria-labelledby={`${id}-avatares`} hidden={active !== 'avatares'}>{active === 'avatares' && <WorkAvatars item={item} catalog={catalog} />}</div></>;
}
