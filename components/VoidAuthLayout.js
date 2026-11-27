import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import MovieHeader from './movies/MovieHeader';

export function GoogleComingSoon() {
  return <><button className="va-google" type="button" disabled aria-disabled="true"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.41 13.92A6 6 0 0 1 6.1 12c0-.67.11-1.32.31-1.92V7.49H3.06A10 10 0 0 0 2 12c0 1.61.39 3.14 1.06 4.51l3.35-2.59Z"/><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.35 2.59A5.96 5.96 0 0 1 12 5.96Z"/></svg><span>Continuar com o Google</span><small>Em breve</small></button><div className="va-divider" aria-hidden="true"><span/>OU<span/></div></>;
}

export function PasswordToggle({ visible, onToggle, disabled }) {
  return <button type="button" className="va-password-toggle" aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={visible} aria-controls="password" disabled={disabled} onClick={onToggle}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{visible && <path d="m3 3 18 18"/>}</svg></button>;
}

export default function VoidAuthLayout({ title, children, signup = false }) {
  const video = useRef(null);
  const [playVideo, setPlayVideo] = useState(false);
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)'), desktop = window.matchMedia('(min-width:900px)');
    const refresh = () => {const allowed = !motion.matches && desktop.matches; if (!allowed) video.current?.pause(); setPlayVideo(allowed);};
    refresh(); motion.addEventListener('change',refresh); desktop.addEventListener('change',refresh);
    return () => {motion.removeEventListener('change',refresh); desktop.removeEventListener('change',refresh);};
  },[]);
  return <div className="account-page va-page"><Head><title>{title} — VOID</title></Head>
    <div className="va-universe" aria-hidden="true"><div className="va-nebula"/><div className="va-stars"/></div>
    <div className="va-navigation"><MovieHeader current="conta" home/></div>
    <main className={`va-card${signup ? ' va-card-signup' : ''}`}>
    <aside className="va-media" aria-label="Seu universo no Void">
      <img className="va-poster" src="/login-void-poster.jpg" alt="" fetchPriority="high" decoding="async"/>
      {playVideo && <video ref={video} autoPlay muted loop playsInline preload="auto" poster="/login-void-poster.jpg" aria-hidden="true" onError={event => {event.currentTarget.style.visibility='hidden';}}><source src="/login-void.webm" type="video/webm"/><source src="/login-void.mp4" type="video/mp4"/></video>}
      <p className="va-tagline">SEU UNIVERSO. SUAS AVALIAÇÕES.</p>
    </aside>
    <section className="va-form-panel"><div className="va-form-content"><Link className="logo va-mobile-logo" href="/" aria-label="Void, voltar ao início">void<span><Icon name="dot"/></span></Link>{children}</div></section>
  </main></div>;
}
