import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { collectionProviders } from '../lib/game-collection';
import { useAccount } from './AccountProvider';
import { steamRequest } from '../lib/steam-client';

export default function SteamConnection() {
  const { client, user } = useAccount();
  return user && client ? <Connection key={user.id} client={client} userId={user.id} /> : null;
}

function Connection({ client, userId }) {
  const router = useRouter();
  const [connection, setConnection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState('');
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const completion = useRef(null);
  const mounted = useRef(false);
  const returned = typeof router.query.steam === 'string' ? router.query.steam : '';

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!router.isReady) return;
    let active = true;
    setLoading(true); setIssue('');
    async function load() {
      let completed = false;
      try {
        if (returned === 'complete') {
          // Share the same completion promise across React's repeated effect setup.
          if (!completion.current) completion.current = steamRequest(client, userId, { method: 'POST', action: 'complete' });
          await completion.current;
          completed = true;
          if (active) setMessage('Steam conectada à sua conta VOID.');
        } else if (returned === 'cancelled' && active) setMessage('Conexão com a Steam cancelada.');
        else if (returned === 'error' && active) setMessage('Não foi possível validar a conexão. Tente conectar novamente.');
        const result = await steamRequest(client, userId);
        if (active) setConnection(result.connection);
      } catch (error) {
        if (active) {
          const text = error.message || 'Não foi possível consultar a conexão com a Steam.';
          if (returned === 'complete') setMessage(text);
          else setIssue(text);
        }
      } finally {
        if (active) {
          setLoading(false);
          if (returned) {
            if (completed) router.replace('/jogos/colecao?importar=steam');
            else {
              const query = { ...router.query };
              delete query.steam;
              router.replace({ pathname: router.pathname, query }, undefined, { shallow: true, scroll: false });
            }
          }
        }
      }
    }
    load();
    return () => { active = false; };
  }, [client, userId, router.isReady, returned, reload]);

  async function connect() {
    setBusy(true); setIssue(''); setMessage('');
    completion.current = null;
    try {
      const { url } = await steamRequest(client, userId, { method: 'POST', action: 'connect' });
      const target = new URL(url);
      if (target.origin !== 'https://steamcommunity.com' || target.pathname !== '/openid/login') throw Error('Não foi possível iniciar a conexão com a Steam.');
      if (mounted.current) window.location.assign(target.href);
    } catch (error) { if (mounted.current) { setIssue(error.message); setBusy(false); } }
  }

  async function disconnect() {
    setBusy(true); setIssue(''); setMessage('');
    try {
      await steamRequest(client, userId, { method: 'DELETE' });
      if (mounted.current) { setConnection(null); setMessage('Steam desconectada da sua conta VOID.'); }
    } catch (error) { if (mounted.current) setIssue(error.message); }
    finally { if (mounted.current) setBusy(false); }
  }

  return <section id="contas-conectadas" className="account-panel steam-connection" aria-labelledby="steam-connection-title" aria-busy={loading || busy}>
    <h2 id="steam-connection-title">Contas conectadas</h2>
    <p>Reúna os jogos que você realmente jogou na Minha Coleção. Suas avaliações e os status manuais da Biblioteca continuam independentes.</p>
    <p>Entre com sua conta Steam para conectar. Não é necessário gerar uma chave pessoal. Para importar seus jogos, os Detalhes dos jogos na Steam precisam estar públicos.</p>
    {loading ? <p role="status">Verificando conexão com a Steam…</p> : connection ? <>
      <p><strong>Steam conectada</strong><br />SteamID: {connection.steam_id}</p>
      <a href={'https://steamcommunity.com/profiles/' + connection.steam_id} target="_blank" rel="noopener noreferrer">Ver meu perfil na Steam</a>
      <button type="button" className="button secondary" disabled={busy} onClick={disconnect}>{busy ? 'Desconectando…' : 'Desconectar Steam'}</button>
      <Link href="/jogos/colecao">Abrir Minha Coleção e sincronizar</Link>
    </> : <button type="button" className="button primary" disabled={busy} onClick={connect}>{busy ? 'Abrindo Steam…' : 'Conectar Steam'}</button>}
    {issue && <div role="alert"><p>{issue}</p><button type="button" className="button secondary" disabled={loading || busy} onClick={() => setReload(value => value + 1)}>Atualizar conexão</button></div>}
    <p role="status" aria-live="polite">{message}</p>
    <div className="gc-connected-platforms">{collectionProviders.map(provider => <div key={provider.key}><img src={provider.icon} alt="" /><span>{provider.label}</span><small>{provider.available ? connection ? 'Conectada' : 'Disponível para conectar' : 'Em breve'}</small></div>)}</div>
  </section>;
}
