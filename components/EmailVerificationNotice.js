import { useEffect, useState } from 'react';
import { useAccount } from './AccountProvider';
import Icon from './Icon';
import { authCooldownKey, cooldownRemaining, emailVerification, startAuthCooldown } from '../lib/email-verification';

export default function EmailVerificationNotice() {
  const { client, user, refreshUser } = useAccount();
  const [state, setState] = useState({ loading: true });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const key = authCooldownKey('verification', user?.id);
  useEffect(() => {
    let active = true, refreshing = false, verified = false, nextCheck = 0, failures = 0;
    async function refresh() {
      if (!active || !client || !user || verified || refreshing || Date.now() < nextCheck || document.visibilityState === 'hidden') return;
      refreshing = true;
      try {
        const data = await emailVerification(client, { action: 'status' });
        if (active) {
          verified = !!data.verified; failures = 0; nextCheck = Date.now() + 15000;
          setState({ ...data, email: user.email });
          if (data.lastSentAt) {
            const until = Date.parse(data.lastSentAt) + 60000;
            setCooldown(Math.max(cooldownRemaining(localStorage, key), Math.min(60, Math.max(0, Math.ceil((until - Date.now()) / 1000)))));
          }
        }
      } catch { if (active) { failures++; nextCheck = Date.now() + Math.min(300000, 15000 * 2 ** Math.min(failures, 5)); setState({ error: true }); } }
      finally { refreshing = false; }
    }
    setState({ loading: true }); setMessage('');
    setCooldown(cooldownRemaining(localStorage, key));
    refresh();
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [client, user?.id, user?.email, key]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(n => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  async function resend() {
    if (busy || cooldown || cooldownRemaining(localStorage, key)) return;
    setBusy(true); setMessage(''); setCooldown(60); startAuthCooldown(localStorage, key);
    try {
      const data = await emailVerification(client, { action: 'request', redirectTo: `${window.location.origin}/verificar-email` });
      if (data.verified) { setState({ verified: true, email: user.email }); await refreshUser(); }
      else setMessage('E-mail de verificação solicitado. Confira sua caixa de entrada e spam.');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  if (state.loading) return <p className="account-email-status" role="status">Consultando verificação do e-mail…</p>;
  if (state.verified && state.email === user?.email) return <p className="account-email-verified"><Icon name="check" /> E-mail verificado</p>;
  return <section className="account-email-notice" aria-label="Verificação opcional do e-mail"><div><Icon name="mail" /><div><strong>{state.error ? 'Não foi possível consultar a verificação do e-mail.' : 'Seu e-mail ainda não foi verificado.'}</strong><p>Verifique seu endereço para ajudar a proteger a recuperação de senha. Você pode continuar usando todas as funcionalidades.</p></div></div><button type="button" disabled={busy || cooldown > 0} onClick={resend}>{busy ? 'Enviando…' : cooldown ? `Aguarde ${cooldown}s para reenviar` : 'Reenviar e-mail de verificação'}</button><p role="status" aria-live="polite">{message}</p></section>;
}
