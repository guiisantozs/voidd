import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAccount } from '../components/AccountProvider';
import { emailVerification } from '../lib/email-verification';

export default function VerifyEmail() {
  const { client, refreshUser } = useAccount();
  const token = useRef(null);
  const [state, setState] = useState('loading');
  const [message, setMessage] = useState('');
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
    token.current = params.get('token_hash');
    // Strip the one-time proof from history before any further navigation.
    window.history.replaceState(window.history.state, '', window.location.pathname);
    setState(token.current && /^[a-f0-9]{32,256}$/i.test(token.current) ? 'ready' : 'invalid');
  }, []);
  async function verify() {
    if (state !== 'ready' || !client) return;
    setState('busy'); setMessage('');
    try {
      await emailVerification(client, { action: 'verify', token_hash: token.current });
      token.current = null; setState('success');
      try { await refreshUser(); } catch { /* Proof is stored; account refresh can retry. */ }
    } catch (error) { setState('invalid'); setMessage(error.message); }
  }
  return <div className="account-page"><Head><title>Verificar e-mail — VOID</title><meta name="referrer" content="no-referrer" /></Head><main><section className="account-panel"><Link href="/" className="logo">void.</Link><h1>Verificação do e-mail</h1>{state === 'loading' ? <p role="status">Preparando verificação…</p> : state === 'success' ? <p role="status">E-mail verificado. Você pode voltar à sua conta.</p> : state === 'invalid' ? <p role="status">{message || 'Este link é inválido ou expirou. Solicite outro em Minha conta.'}</p> : <><p>Confirme que deseja verificar o endereço que recebeu este e-mail. Isso não altera sua sessão nem é necessário para usar o VOID.</p><button className="button primary" disabled={state === 'busy' || !client} onClick={verify}>{state === 'busy' ? 'Verificando…' : 'Verificar meu e-mail'}</button></>}<p><Link href="/conta">Ir para Minha conta</Link></p></section></main></div>;
}
