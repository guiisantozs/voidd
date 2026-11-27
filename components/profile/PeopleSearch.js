import Link from 'next/link';
import { useRouter } from 'next/router';
import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState } from 'react';
import { useAccount } from '../AccountProvider';
import { ProfileAvatar } from './ProfileUI';
import FollowButton from './FollowButton';
import Icon from '../Icon';
import { normalizeUsername, profileHref } from '../../lib/usernames';
import { addRecentPerson, readRecentPeople, recentPeopleKey } from '../../lib/people-search';
import {SEARCH_DELAY_MS} from '../../lib/catalog-cache-policy';
import {createScopedSearchCache} from '../../lib/scoped-search-cache';

export function PeopleSearch({ onNavigate, onInvite, inviteDisabled, autoFocus = false, refreshKey = 0 }) {
  const { client, user } = useAccount();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState({});
  const [retry, setRetry] = useState(0);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState([]);
  const input = useRef(null);
  const searchCache=useRef(createScopedSearchCache());
  const id = useId();
  const storageKey = recentPeopleKey(user?.id);
  const term = normalizeUsername(query);
  const valid = /^[a-z0-9][a-z0-9._]{1,19}$/.test(term) && !/[._]{2}/.test(term);
  useEffect(() => {
    try { setRecent(readRecentPeople(localStorage, storageKey)); } catch { setRecent([]); }
    setQuery(''); setResult({}); setActive(-1);
  }, [storageKey]);
  useEffect(() => { if (autoFocus) input.current?.focus(); }, [autoFocus]);
  useEffect(() => {
    if (!valid || !client) return;
    const scope=JSON.stringify([user?.id||'guest',refreshKey,retry]);
    const cached=searchCache.current.get(scope,term);
    if(cached){setResult({key:term,people:cached});return;}
    const controller = new AbortController();
    setResult({key:term,loading:true});
    const timer = setTimeout(async () => {
      setResult({ key: term, loading: true });
      try {
        const { data, error } = await client.rpc('void_people_search', { term }).abortSignal(controller.signal);
        if (error) throw error;
        if (!controller.signal.aborted){searchCache.current.set(scope,term,data);setResult({ key: term, people: data });}
      } catch (error) {
        if (!controller.signal.aborted) setResult({ key: term, error: error.message?.includes('RATE_LIMIT') ? 'Muitas buscas. Aguarde um minuto e tente novamente.' : 'Não foi possível buscar pessoas. Tente novamente.' });
      }
    }, SEARCH_DELAY_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [term, valid, client, user?.id, retry, refreshKey]);
  const loading = valid && !!client && (result.key !== term || result.loading);
  const error = valid && (!client ? 'A busca está indisponível neste momento.' : result.key === term && result.error);
  const people = valid && !loading && !error && result.key === term ? result.people || [] : [];
  const rows = !term ? recent : people;
  const selected = rows[active];
  useEffect(() => { setActive(-1); }, [term, result, storageKey]);
  useEffect(() => { if (selected) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active, selected, id]);
  function remember(person) {
    try { setRecent(addRecentPerson(localStorage, storageKey, person)); } catch { /* Storage is optional. */ }
    onNavigate?.();
  }
  function keys(event) {
    if (event.nativeEvent.isComposing) return;
    if (['ArrowDown', 'ArrowUp'].includes(event.key) && rows.length) {
      event.preventDefault();
      setActive(index => event.key === 'ArrowDown' ? (index + 1) % rows.length : (index <= 0 ? rows.length - 1 : index - 1));
    } else if (event.key === 'Enter' && selected) {
      event.preventDefault(); remember(selected); router.push(profileHref(selected));
    }
  }
  function change(value) { setQuery(value.replace(/@/g, '')); setResult({}); setActive(-1); }
  function clearRecent() {
    setRecent([]);
    try { localStorage.removeItem(storageKey); } catch { /* Local history only. */ }
    input.current?.focus();
  }
  const status = !term ? 'Digite ao menos 2 caracteres para buscar.' : !valid ? 'Digite ao menos 2 caracteres válidos.' : loading ? 'Buscando pessoas…' : error || `${people.length} ${people.length === 1 ? 'pessoa encontrada' : 'pessoas encontradas'}.`;
  return <section className="void-people-search" aria-label="Buscar pessoas pelo @">
    <label className="sr-only" htmlFor={`${id}-input`}>Buscar pessoas pelo nome de usuário</label>
    <div className="void-people-input"><Icon name="search" /><span className="void-people-prefix" aria-hidden="true">@</span>
      <input ref={input} id={`${id}-input`} role="combobox" aria-autocomplete="list" aria-expanded={rows.length > 0} aria-controls={`${id}-list`} aria-activedescendant={selected ? `${id}-option-${active}` : undefined} aria-describedby={`${id}-status`} type="search" value={query} maxLength={21} placeholder="usuario" autoCapitalize="none" autoComplete="off" spellCheck={false} onKeyDown={keys} onChange={event => change(event.target.value)} />
      {query && <button className="void-people-clear" type="button" aria-label="Limpar busca" onClick={() => { change(''); input.current?.focus(); }}><Icon name="close" /></button>}
    </div>
    <p id={`${id}-status`} className="void-people-status" role="status" aria-live="polite" aria-atomic="true">{status}</p>
    {!term && <div className="void-people-recent-heading"><h3>Buscas recentes</h3>{recent.length > 0 && <button type="button" onClick={clearRecent}>Limpar</button>}</div>}
    {loading && <div className="void-people-skeletons" aria-hidden="true">{[0, 1, 2].map(n => <div key={n}><i /><span><b /><b /></span></div>)}</div>}
    {error && <div className="void-people-empty"><Icon name="refresh" /><p>{error}</p>{client && <button type="button" onClick={() => { setResult({}); setRetry(n => n + 1); }}>Tentar novamente</button>}</div>}
    {valid && !loading && !error && people.length === 0 && <div className="void-people-empty"><Icon name="users" /><h3>Nenhum @ encontrado</h3><p>Confira o nome ou tente outro começo de @.</p></div>}
    {!term && !recent.length && <div className="void-people-empty"><Icon name="clock" /><p>Os perfis que você abrir pela busca aparecem aqui.</p></div>}
    <div className="void-people-results">
      <div id={`${id}-list`} role="listbox" aria-label={!term ? 'Buscas recentes' : 'Pessoas encontradas'} aria-busy={!!loading}>
        {rows.map((person, index) => <div role="presentation" className={`void-people-row ${active === index ? 'is-active' : ''}`} key={person.user_id}>
          <Link id={`${id}-option-${index}`} role="option" aria-selected={active === index} href={profileHref(person)} onClick={() => remember(person)} onFocus={() => setActive(index)}>
            <ProfileAvatar profile={person} /><span className="void-people-identity"><strong>{person.display_name}</strong><small>@{term && person.username.startsWith(term) ? <><mark>{person.username.slice(0, term.length)}</mark>{person.username.slice(term.length)}</> : person.username}</small></span>
          </Link>
        </div>)}
      </div>
      {/* Keep secondary actions outside the listbox options. */}
      {rows.length > 0 && term && <div className="void-people-action-column">{rows.map(person => <div className="void-people-actions" role="group" aria-label={`Ações para @${person.username}`} key={person.user_id}><FollowButton target={person.user_id} following={person.following} onChanged={() => { setResult({}); setRetry(n => n + 1); }} />{onInvite && user && person.user_id !== user.id && <button type="button" disabled={inviteDisabled?.(person.user_id)} onClick={() => onInvite(person.user_id)}>Enviar convite</button>}</div>)}</div>}
    </div>
    <footer className="void-people-privacy">Apenas nome de exibição, @ e avatar. Perfis privados continuam protegidos.</footer>
  </section>;
}

export default function PeopleMenuSearch() {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const button = useRef(null), panel = useRef(null);
  const id = useId();
  function close() {
    setOpen(false);
    // Restore after the fullscreen sheet has released the inert background.
    requestAnimationFrame(() => button.current?.focus({ preventScroll: true }));
  }
  useEffect(() => {
    function shortcut(event) {
      const editable = event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"]');
      const command = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.altKey;
      const slash = event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !editable;
      if (!event.isComposing && (command || slash)) { event.preventDefault(); setOpen(true); panel.current?.querySelector('input')?.focus(); }
    }
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => {
    if (!open) return;
    function place() {
      const rect = button.current?.getBoundingClientRect();
      if (rect) setPosition({ top: rect.bottom + 10, left: Math.max(12, Math.min(rect.left, window.innerWidth - 432)) });
    }
    function outside(event) { if (!panel.current?.contains(event.target) && !button.current?.contains(event.target)) close(); }
    function keys(event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key === 'Tab' && window.matchMedia('(max-width: 650px)').matches) {
        const elements = Array.from(panel.current?.querySelectorAll('a[href],button:not(:disabled),input') || []);
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    place();
    const media = window.matchMedia('(max-width: 650px)');
    const overflow = document.body.style.overflow;
    const root = document.getElementById('__next');
    const wasInert = root?.inert || false;
    function adapt() {
      setMobile(media.matches);
      document.body.style.overflow = media.matches ? 'hidden' : overflow;
      if (root) root.inert = media.matches || wasInert;
      place();
    }
    adapt();
    media.addEventListener('change', adapt);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keys);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.body.style.overflow = overflow;
      if (root) root.inert = wasInert;
      media.removeEventListener('change', adapt);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', keys);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);
  return <><button ref={button} type="button" className="void-people-menu-button" aria-label="Buscar pessoas" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} aria-keyshortcuts="/ Control+k Meta+k" onClick={() => open ? close() : setOpen(true)}><Icon name="search" /><span>Buscar pessoas</span><kbd aria-hidden="true">/</kbd></button>
    {open && createPortal(<div ref={panel} id={id} className="void-people-popover" role="dialog" aria-modal={mobile || undefined} aria-label="Buscar pessoas" style={{ top: position.top, left: position.left }}><header className="void-people-panel-heading"><h2>Encontrar pessoas</h2><button type="button" aria-label="Fechar busca" onClick={close}><Icon name="close" /></button></header><PeopleSearch autoFocus onNavigate={close} /></div>, document.body)}
  </>;
}
