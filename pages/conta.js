import DisplayNameField from '../components/profile/DisplayNameField';
import SteamConnection from '../components/SteamConnection';
import { NotificationPreferences } from '../components/notifications/Notifications';
import UsernameField from '../components/profile/UsernameField';
import { usernameValid } from '../lib/usernames';
import Icon from '../components/Icon';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import VoidAuthLayout, { GoogleComingSoon, PasswordToggle } from '../components/VoidAuthLayout';
import VoidAuthSuccess from '../components/VoidAuthSuccess';
import EmailVerificationNotice from '../components/EmailVerificationNotice';
import { authSuccessPending, consumeAuthSuccess, markAuthSuccess } from '../lib/auth-experience';
import { useAccount } from '../components/AccountProvider';
import { readReviews } from '../lib/catalog';
import { readLibrary } from '../lib/library';
import { scopedStorage } from '../lib/account-storage';
import { authErrorMessage, authLinkMessage, emailIsValid, sendAccountEmail, RECOVERY_NOTICE } from '../lib/account-auth';
import { authCooldownKey, cooldownRemaining, signInWithOptionalEmail, startAuthCooldown } from '../lib/email-verification';
import {safeSocialReturn} from '../lib/social-community';

export default function Conta() {
  const router = useRouter();
  const { client, user, error, syncing, synchronize, importLocal, recovery, finishRecovery } = useAccount();
  const [levelUp, setLevelUp] = useState(() => {
    if (typeof window === 'undefined' || !user) return false;
    try { return authSuccessPending(sessionStorage, user, recovery); } catch { return false; }
  });
  const firstInput = useRef(null);
  const isAuthView = !user || (levelUp && !recovery);
  const [mode, setMode] = useState('login');
  useEffect(() => { if (router.isReady && ['signup','login'].includes(router.query.modo)) { setMode(router.query.modo); } }, [router.isReady, router.query.modo]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [name, setName] = useState('');
  const [username,setUsername]=useState(''),[usernameStatus,setUsernameStatus]=useState('idle'),[usernameCheck,setUsernameCheck]=useState(0);
  const [nameStatus,setNameStatus]=useState('idle');
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [emailCooldown, setEmailCooldown] = useState(0);
  const [signupCooldown, setSignupCooldown] = useState(0);
  const [stats, setStats] = useState({ reviews: 0, games: 0 });
  useEffect(()=>{const target=safeSocialReturn(router.query.returnTo);if(target){try{sessionStorage.setItem('void:avatar-return',target);}catch{/* The query still supports the current login. */}}},[router.query.returnTo]);
  function avatarReturn(){let target=safeSocialReturn(router.query.returnTo);try{target ||= safeSocialReturn(sessionStorage.getItem('void:avatar-return'));sessionStorage.removeItem('void:avatar-return');}catch{}return target;}
  useEffect(()=>{if(!user||levelUp||recovery||!router.isReady)return;const target=avatarReturn();if(target)router.replace(target);},[user?.id,levelUp,recovery,router.isReady]);
  useEffect(() => {
    const notice = authLinkMessage(window.location.search, window.location.hash);
    if (notice) setMessage(notice);
    setEmailCooldown(cooldownRemaining(localStorage, authCooldownKey('recovery')));
    setSignupCooldown(cooldownRemaining(localStorage, authCooldownKey('signup')));
  }, []);
  useEffect(() => {
    if (!signupCooldown) return;
    const timer = setTimeout(() => setSignupCooldown(n => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(timer);
  }, [signupCooldown]);
  useEffect(() => {
    if (!emailCooldown) return;
    const timer = setTimeout(() => setEmailCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [emailCooldown]);
  useEffect(() => {
    if (!client || !user) return;
    let alive = true;
    setName(user.user_metadata?.display_name || '');
    async function load() {
      const { data, error: issue } = await client.from('void_profiles').select('display_name,bio').eq('user_id', user.id).maybeSingle();
      if (!alive) return;
      if (issue) setMessage('Não foi possível carregar o perfil. Verifique a conexão e a configuração do banco.');
      else if (data) { setName(data.display_name); setBio(data.bio); }
      try { setStats({ reviews: Object.keys(readReviews()).length, games: Object.keys(readLibrary(scopedStorage(localStorage))).length }); } catch { setMessage('Não foi possível ler os registros locais desta conta.'); }
    }
    load();
    return () => { alive = false; };
  }, [client, user?.id]);
  useEffect(() => {
    if (!levelUp || !user || recovery) return;
    try { consumeAuthSuccess(sessionStorage, user, recovery); } catch { /* Visual state only. */ }
    const timer = setTimeout(() => { router.replace(avatarReturn()||'/'); }, 1500);
    return () => clearTimeout(timer);
  }, [levelUp, user?.id, recovery, router]);
  async function authenticate(event) {
    event.preventDefault();
    if (busy || !event.currentTarget.reportValidity()) return;
    if(mode==='signup'&&nameStatus==='prohibited')return;
    if (mode === 'signup' && (signupCooldown || cooldownRemaining(localStorage, authCooldownKey('signup')))) { setMessage('Aguarde um minuto antes de tentar outro cadastro.'); return; }
    if(mode==='signup'&&(!usernameValid(username)||usernameStatus!=='available')){setMessage('Escolha um @ válido e disponível para criar a conta.');return;}
    setBusy(true); setMessage('');
    try {
      if (!client) throw new Error('O serviço de conta ainda não está configurado.');
      if(mode==='signup'){
        const {data:allowed,error:checkError}=await client.rpc('void_name_check',{value:name});
        if(checkError){setMessage('Não foi possível verificar seu nome. Tente novamente.');return;}
        if(!allowed){setMessage('Este nome não pode ser utilizado. Escolha outro nome para continuar.');return;}
      }
      if (mode === 'signup') { startAuthCooldown(localStorage, authCooldownKey('signup')); setSignupCooldown(60); }
      let result = mode === 'signup'
        ? await client.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim(), username }, emailRedirectTo: `${window.location.origin}/conta` } })
        : await signInWithOptionalEmail(client, { email: email.trim(), password });
      if (!result.error && !result.data?.session) result = await signInWithOptionalEmail(client, { email: email.trim(), password });
      if (result.error) {
        if(mode==='signup'){const {data:available}=await client.rpc('void_username_check',{candidate:username});setMessage(available==='taken'?'Esse @ acabou de ser escolhido por outra pessoa. Escolha outro.':authErrorMessage(result.error,true));setUsernameCheck(n=>n+1);}else setMessage(authErrorMessage(result.error,false));
      } else {
        if (result.data.session) {
          try { markAuthSuccess(sessionStorage, result.data.session.user); } catch { /* A animação local ainda funciona sem sessionStorage. */ }
          setLevelUp(true);
        }
        setPassword('');
        setMessage('Você entrou na conta.');
      }
    } catch { setMessage('Não foi possível conectar ao serviço de conta. Tente novamente.'); }
    finally { setBusy(false); }
  }
  async function saveProfile(event) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const { error: issue } = await client.from('void_profiles').upsert({ user_id: user.id, display_name: name.trim(), bio: bio.trim() });
      if (issue) throw issue;
      setMessage('Perfil salvo.');
    } catch (issue) { setMessage(issue?.message?.includes('NAME_PROHIBITED')?'Este nome não pode ser utilizado. Escolha outro nome para continuar.':'Não foi possível salvar o perfil. Tente novamente.'); }
    finally { setBusy(false); }
  }
  async function resetPassword() {
    if (busy || emailCooldown || cooldownRemaining(localStorage, authCooldownKey('recovery'))) return;
    const destination = user?.email || email;
    if (!emailIsValid(destination)) { setMessage('Preencha um e-mail válido no campo acima.'); document.getElementById('email')?.focus(); return; }
    setBusy(true); setMessage(''); setEmailCooldown(60);
    startAuthCooldown(localStorage, authCooldownKey('recovery'));
    try {
      await sendAccountEmail(client, 'recovery', destination, window.location.origin);
    } catch {
      // The same UI response for missing accounts, delivery errors and success.
      // Otherwise SMTP failures could disclose which addresses are registered.
    }
    finally { setMessage(RECOVERY_NOTICE); setBusy(false); }
  }
  async function signOut() {
    setBusy(true); setMessage('');
    try {
      try { await synchronize(); } catch { /* Pendências permanecem no cache privado para o próximo login. */ }
      const { error: issue } = await client.auth.signOut({ scope: 'local' });
      if (issue) throw issue;
    } catch { setMessage('Não foi possível concluir a saída. Tente sincronizar e sair novamente.'); }
    finally { setBusy(false); }
  }
  if (levelUp && !recovery) return <VoidAuthSuccess name={name || user?.user_metadata?.display_name}/>;
  if (isAuthView) return <VoidAuthLayout title={mode === 'signup' ? 'Entre no Void' : 'Entrar no Void'} signup={mode === 'signup'}>
    {!client ? <div className="va-unavailable"><h1>Conta Void</h1><p>O acesso online ainda não está disponível neste ambiente. Você pode continuar usando suas listas e avaliações como visitante.</p><Link href="/jogos">Explorar jogos <Icon name="arrow-up-right"/></Link></div> : <>
      <header className="va-heading"><p>{mode === 'signup' ? 'Crie sua conta grátis' : 'Bem-vindo de volta'}</p><h1>{mode === 'signup' ? 'Entre no Void' : 'Entrar no Void'}</h1></header>
      <GoogleComingSoon/>
      <form className="va-form" onSubmit={authenticate} aria-busy={busy}>
        {mode === 'signup' && <div className="va-signup-fields"><DisplayNameField inputRef={firstInput} id="signup-name" value={name} onChange={setName} onStatus={setNameStatus} disabled={busy}/><UsernameField key={usernameCheck} value={username} onChange={setUsername} onStatus={setUsernameStatus} disabled={busy}/></div>}
        <div className="va-field"><label htmlFor="email">E-mail</label><input ref={mode === 'login' ? firstInput : undefined} id="email" type="email" autoComplete="email" required disabled={busy} value={email} onChange={event => {setEmail(event.target.value); setFieldErrors(old=>({...old,email:''}));}} onInvalid={() => setFieldErrors(old=>({...old,email:'Informe um e-mail válido.'}))} aria-invalid={Boolean(fieldErrors.email) || undefined} aria-describedby={fieldErrors.email ? 'va-email-error' : undefined} placeholder="voce@exemplo.com"/>{fieldErrors.email && <small id="va-email-error" className="va-field-error">{fieldErrors.email}</small>}</div>
        <div className="va-field"><div className="va-password-label"><label htmlFor="password">Senha</label>{mode === 'login' && <button type="button" className="va-forgot" disabled={busy || emailCooldown > 0} onClick={resetPassword}>Esqueci minha senha</button>}</div><div className="va-password"><input id="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 8 : undefined} required disabled={busy} value={password} onChange={event => {setPassword(event.target.value); setFieldErrors(old=>({...old,password:''}));}} onInvalid={() => setFieldErrors(old=>({...old,password:mode === 'signup' ? 'Use pelo menos 8 caracteres.' : 'Informe sua senha.'}))} aria-invalid={Boolean(fieldErrors.password) || undefined} aria-describedby={fieldErrors.password ? 'va-password-error' : mode === 'signup' ? 'va-password-help' : undefined} placeholder={mode === 'signup' ? 'Pelo menos 8 caracteres' : 'Sua senha'}/><PasswordToggle visible={showPassword} onToggle={() => setShowPassword(value=>!value)} disabled={busy}/></div>{fieldErrors.password ? <small id="va-password-error" className="va-field-error">{fieldErrors.password}</small> : mode === 'signup' && <small id="va-password-help" className="va-field-help">Use pelo menos 8 caracteres.</small>}</div>
        <button className="va-submit" type="submit" disabled={busy || (mode === 'signup' && (usernameStatus !== 'available' || signupCooldown > 0 || nameStatus === 'prohibited'))}>{busy ? <><span className="va-spinner" aria-hidden="true"/>{mode === 'signup' ? 'Criando conta…' : 'Entrando…'}</> : mode === 'signup' && signupCooldown ? 'Aguarde ' + signupCooldown + 's' : mode === 'signup' ? 'Criar conta' : 'Entrar'}{!busy && <span aria-hidden="true">&gt;</span>}</button>
      </form>
      <p className="va-switch">{mode === 'signup' ? 'Já tem conta?' : 'Ainda não tem conta?'} <button type="button" disabled={busy} onClick={() => {setMode(mode === 'signup' ? 'login' : 'signup'); setMessage(''); setFieldErrors({}); setShowPassword(false);}}>{mode === 'signup' ? 'Entrar' : 'Criar conta'}</button></p>
    </>}
    <p className="va-message" role="status" aria-live="polite" aria-atomic="true">{message || error}</p>
    <footer className="va-copyright"><p>© {new Date().getFullYear()} Void. Todos os direitos reservados.</p><p>Criado por <span>@santozstech</span></p></footer>
  </VoidAuthLayout>;
  return <div className="account-page"><Head><title>Minha conta — VOID</title></Head><header><Link className="logo" href="/">void<span><Icon name="dot"/></span></Link><Link href="/"><Icon name="arrow-left"/> Explorar o VOID</Link></header><main>
    {recovery && <form className="account-panel" onSubmit={async event => { event.preventDefault(); setBusy(true); try { const { error: issue } = await client.auth.updateUser({ password }); if (issue) throw issue; setPassword(''); finishRecovery(); setMessage('Senha atualizada.'); } catch { setMessage('Não foi possível atualizar a senha. Tente novamente ou solicite outro link.'); } finally { setBusy(false); } }}><h2>Definir nova senha</h2><label htmlFor="new-password">Nova senha</label><input id="new-password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={event => setPassword(event.target.value)} /><button className="button primary" disabled={busy}>Atualizar senha</button></form>}<div className="account-heading"><div><p>Minha conta</p><h1>{name || 'Seu perfil'}</h1><span>{user.email}</span></div><button className="button secondary" disabled={busy || syncing} onClick={signOut}>Sair</button></div>
    <EmailVerificationNotice/><div className="account-stats"><div><strong>{stats.reviews}</strong><span>Avaliações</span></div><div><strong>{stats.games}</strong><span>Jogos na lista</span></div><div><strong>Protegida</strong><span>Sua conta e dados de acesso</span></div></div>
    <form className="account-panel" onSubmit={saveProfile}><h2>Perfil da conta (privado)</h2><p className="muted">Sua identidade na comunidade tem suas próprias opções de visibilidade. <Link href="/perfil">{"Abrir e editar meu perfil "}<Icon name="arrow-right" /></Link></p><DisplayNameField id="display-name" value={name} onChange={setName} onStatus={setNameStatus} disabled={busy}/><label htmlFor="bio">Sobre você</label><textarea id="bio" maxLength={240} rows={3} value={bio} onChange={e => setBio(e.target.value)} placeholder="Jogos favoritos, gêneros que curte…" /><button className="button primary" disabled={busy || !name.trim() || nameStatus==='prohibited'}>Salvar perfil</button></form>
    <SteamConnection/><NotificationPreferences/><section className="account-panel"><h2>Seus registros</h2><p>Listas e avaliações desta conta são enviadas ao banco automaticamente. Rascunhos ficam neste navegador.</p><button className="button secondary" disabled={busy || syncing} onClick={async () => { setBusy(true); setMessage(''); try { await synchronize(true); setMessage('Registros atualizados.'); } catch { setMessage('Não foi possível sincronizar agora.'); } finally { setBusy(false); } }}>{syncing ? 'Sincronizando…' : 'Atualizar entre dispositivos'}</button><Link href="/jogos/biblioteca">{"Abrir minha biblioteca "}<Icon name="arrow-up-right" /></Link></section>
    <section className="account-panel"><h2>Trazer meus registros de visitante</h2><p>Adiciona os registros antigos deste navegador à sua conta. Títulos que já estão na conta mantêm a versão da conta; a cópia de visitante permanece guardada.</p><button className="button secondary" disabled={busy || syncing} onClick={async () => { setBusy(true); setMessage(''); try { const count = await importLocal(); setMessage(`${count} registros importados.`); } catch { setMessage('A importação não foi concluída. Registros já copiados ficam guardados nesta conta; tente sincronizar novamente.'); } finally { setBusy(false); } }}>Importar registros de visitante</button></section>
    <p className="account-message" role="status" aria-live="polite" aria-atomic="true">{message || error}</p>
  </main></div>;
}
