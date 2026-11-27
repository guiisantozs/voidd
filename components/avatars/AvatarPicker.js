import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAccount } from '../AccountProvider';
import Icon from '../Icon';
import { AVATAR_CHANGED, AVATAR_TYPES, avatarAlt, avatarColor, avatarGroups, avatarImageUrl, saveCharacterAvatar } from '../../lib/avatars';

export function CharacterPortrait({ avatar, large = false }) {
  const [failed, setFailed] = useState(false), src = avatarImageUrl(avatar, large ? 384 : 192);
  useEffect(() => setFailed(false), [src]);
  return <span className={`va-portrait${large ? ' va-portrait-large' : ''}`} style={{ background: avatarColor(avatar) }}>{src && !failed ? <img src={src} srcSet={`${avatarImageUrl(avatar, 96)} 96w, ${avatarImageUrl(avatar, 192)} 192w, ${avatarImageUrl(avatar, 384)} 384w`} sizes={large ? '192px' : '(max-width: 600px) 96px, 128px'} alt={avatarAlt(avatar)} width={large ? 384 : 192} height={large ? 384 : 192} loading={large ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} /> : <Icon name="user" />}</span>;
}
export default function AvatarPicker({ catalog, grouped = false, onSaved, returnHref, headingId, actionLabel = 'Usar como meu avatar' }) {
  const { client, user, ownProfile, ready } = useAccount(), router = useRouter(), labelId = useId();
  const [search, setSearch] = useState(''), [type, setType] = useState(''), [selected, setSelected] = useState(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const scope = useRef(user?.id), locked = useRef(false), root = useRef(null); scope.current = user?.id;
  const currentId = ownProfile?.avatar_id || null;
  useEffect(() => { setSelected(currentId); setMessage(''); }, [user?.id, currentId]);
  useEffect(() => () => { scope.current = undefined; }, []);
  const groups = avatarGroups(catalog.rows, search, type), visible = groups.flatMap(group => group.rows), chosen = catalog.rows.find(avatar => avatar.id === selected);
  async function activate(avatar) {
    if (!user || !client || locked.current) return;
    const owner = user.id; locked.current = true; setBusy(true); setMessage('');
    try {
      const identity = await saveCharacterAvatar(client, owner, avatar?.id || null);
      if (scope.current !== owner) return;
      window.dispatchEvent(new CustomEvent('void:identity-changed', { detail: identity }));
      window.dispatchEvent(new CustomEvent(AVATAR_CHANGED, { detail: { identity, avatar } }));
      onSaved?.(identity); setMessage(avatar ? `${avatar.character_name} é seu novo avatar.` : 'Sua foto de perfil voltou a aparecer.');
    } catch { if (scope.current === owner) setMessage('Não foi possível aplicar. O avatar pode estar indisponível. Tente novamente.'); }
    finally { locked.current = false; if (scope.current === owner) setBusy(false); }
  }
  function keyDown(event, avatar) {
    if (event.target.getAttribute('role') !== 'radio') return;
    const index = visible.findIndex(row => row.id === avatar.id); let next;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % visible.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + visible.length - 1) % visible.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = visible.length - 1;
    else return;
    event.preventDefault(); const target = visible[next]; setSelected(target.id);
    root.current?.querySelector(`[data-avatar-id="${target.id}"]`)?.focus();
  }
  const login = '/conta?modo=login&returnTo=' + encodeURIComponent(returnHref || router.asPath);
  const tabId = visible.some(row => row.id === selected) ? selected : visible[0]?.id;
  return <section className={`va-picker${grouped ? ' va-picker-grouped' : ''}`} ref={root} aria-busy={busy || catalog.loading}>
    {!headingId && <div className="va-picker-heading"><div><p className="va-eyebrow">SEU PERSONAGEM NO VOID</p><h3 id={labelId}>Escolha quem vai com você</h3><p>Um rosto das histórias que fazem parte do seu universo.</p></div><Icon name="user" /></div>}
    {grouped && <><div className="va-selection-preview">{chosen ? <CharacterPortrait avatar={chosen} large /> : <span className="va-portrait va-portrait-large va-placeholder"><Icon name="user" /></span>}<div><strong>{chosen?.character_name || 'Encontre seu personagem'}</strong><p>{chosen?.media_title || 'Selecione um avatar nas fileiras abaixo.'}</p>{chosen && <span>{chosen.id === currentId ? 'Em uso' : 'Prévia do avatar'}</span>}{user && <div className="va-actions"><button type="button" className="va-primary" disabled={busy || !chosen || chosen.id === currentId} onClick={() => activate(chosen)}>{busy ? 'Aplicando…' : chosen?.id === currentId ? 'Em uso' : 'Usar este avatar'}</button><button type="button" disabled={busy || !currentId} onClick={() => activate(null)}>Voltar para minha foto</button></div>}</div></div><div className="va-filters"><label><span>Buscar personagem ou obra</span><span><Icon name="search" /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Kratos, Ellie, Hollow Knight…" /></span></label><label><span>Tipo de obra</span><select value={type} onChange={event => setType(event.target.value)}><option value="">Todos os tipos</option>{AVATAR_TYPES.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label></div></>}
    {catalog.loading ? <div className="va-skeletons" role="status" aria-label="Carregando avatares">{[1, 2, 3, 4, 5, 6].map(n => <span key={n} />)}</div> : catalog.error ? <div className="va-empty" role="status"><Icon name="user" /><p>Não foi possível carregar os avatares.</p><button type="button" onClick={catalog.retry}>Tentar novamente</button></div> : !visible.length ? <div className="va-empty"><Icon name="user" /><p>{search || type ? 'Nenhum avatar com esses filtros.' : 'Ainda não há avatares por aqui'}</p>{(search || type) && <button type="button" onClick={() => { setSearch(''); setType(''); }}>Limpar filtros</button>}</div> : <div role="radiogroup" aria-labelledby={headingId || labelId}>{groups.map(group => <div className="va-work-group" key={group.key}>{grouped && <div className="va-row-heading"><h4>{group.title}</h4><span>{group.rows.length} avatares</span></div>}<div className={grouped ? 'va-avatar-row' : 'va-avatar-grid'}>{group.rows.map(avatar => <article key={avatar.id} className={`va-option${selected === avatar.id ? ' is-selected' : ''}${currentId === avatar.id ? ' is-current' : ''}`}><button type="button" role="radio" data-avatar-id={avatar.id} aria-checked={selected === avatar.id} aria-label={`${avatar.character_name}, ${avatar.media_title}${currentId === avatar.id ? ', Em uso' : ''}`} tabIndex={tabId === avatar.id ? 0 : -1} disabled={busy} onClick={() => setSelected(avatar.id)} onKeyDown={event => keyDown(event, avatar)}><CharacterPortrait avatar={avatar} />{currentId === avatar.id && <span className="va-current-check" aria-hidden="true"><Icon name="check" /></span>}<span className="va-character-name">{avatar.character_name}</span></button>{currentId === avatar.id && <span className="va-in-use">Em uso</span>}{!grouped && (user ? <button type="button" className="va-use-button" disabled={busy} onClick={() => activate(currentId === avatar.id ? null : avatar)}>{currentId === avatar.id ? 'Remover' : actionLabel}</button> : <Link className="va-use-button" href={login}>{actionLabel}</Link>)}</article>)}</div></div>)}</div>}
    <p className="va-feedback" role="status" aria-live="polite">{message}</p>
    {!ready && <p className="va-help">Verificando sua conta…</p>}
  </section>;
}
