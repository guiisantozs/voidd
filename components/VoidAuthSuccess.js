import Head from 'next/head';
import Link from 'next/link';
import Icon from './Icon';
import VoidAuthScene, { useAuthScene } from './VoidAuthScene';

// Keep the original success presentation separate from the login/signup card.
export default function VoidAuthSuccess({ name }) {
  const scene = useAuthScene(true);
  return <div className="account-page void-auth-page">
    <Head><title>Minha conta — VOID</title></Head>
    <VoidAuthScene posters={scene.posters}/>
    <header><Link className="logo" href="/">void<span><Icon name="dot"/></span></Link><Link href="/"><Icon name="arrow-left"/> Explorar o VOID</Link></header>
    <main><section className="account-panel void-level-up" role="status" aria-live="polite">
      <span className="void-level-icon" aria-hidden="true"><Icon name="sparkle"/></span>
      <p className="void-overline">CONEXÃO ESTABELECIDA</p><h1>LEVEL UP!</h1>
      <p>Bem-vindo de volta{name ? <>, <strong>{name}</strong></> : ' ao VOID'}</p>
      <div className="void-xp-track" aria-hidden="true"><span/></div><small>Preparando seu próximo capítulo…</small>
    </section></main>
    <footer className="void-auth-footer"><span>FOR EVERY STORY. EVERY PLAYER.</span><a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">Dados fornecidos por TMDB</a></footer>
  </div>;
}
