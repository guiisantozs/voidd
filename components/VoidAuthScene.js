import { useEffect, useState } from 'react';
import { KONAMI, konamiStep } from '../lib/auth-experience';

export const authPhrases = ['Só mais um episódio...', 'Seu backlog sentiu sua falta', 'Platinar ou dormir?', 'Nota 10 ou nota 0, não existe meio-termo'];
export function useAuthScene(enabled) {
  const [scene, setScene] = useState({ posters: [], providers: [] });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch('/api/auth-scene', { signal: controller.signal }).then(response => response.ok ? response.json() : null)
      .then(data => { if (data && !controller.signal.aborted) setScene(data); }).catch(() => {});
    return () => controller.abort();
  }, [enabled]);
  return scene;
}
export default function VoidAuthScene({ posters }) {
  const [mobile, setMobile] = useState(false);
  const [boost, setBoost] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 600px)');
    const update = () => setMobile(media.matches); update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    let index = 0; let timer;
    function keydown(event) {
      if (typeof event.key !== 'string' || !event.key || event.isComposing || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (index >= 8 && event.key.toLowerCase() === KONAMI[index]) event.preventDefault();
      index = konamiStep(index, event.key);
      if (index === KONAMI.length) { index = 0; setBoost(true); clearTimeout(timer); timer = setTimeout(() => setBoost(false), 5000); }
    }
    window.addEventListener('keydown', keydown);
    return () => { window.removeEventListener('keydown', keydown); clearTimeout(timer); };
  }, []);
  // Static composition avoids dozens of continuously composited poster layers.
  const rings = mobile ? [posters.slice(0, 6)] : [posters.slice(0, 6), posters.slice(6, 12)];
  return <><div className={`void-space ${boost ? 'void-boost' : ''}`} aria-hidden="true"><div className="void-stars" /><div className="void-vortex" /><div className="void-event-horizon" />{rings.map((ring, ringIndex) => <div className={`void-orbit void-orbit-${ringIndex}`} key={ringIndex}><div className="void-orbit-spin">{ring.map((src, index) => <div className="void-orbit-slot" key={src} style={{ '--angle': `${360 * index / ring.length + ringIndex * 14}deg` }}><div className="void-poster-counter"><img src={src} width="92" height="138" loading="lazy" decoding="async" alt="" onError={event => { event.currentTarget.style.visibility = 'hidden'; }} /></div></div>)}</div></div>)}<div className="void-space-shade" /></div><p className="void-easter-egg" role="status" aria-live="polite">{boost ? 'CHEAT ATIVADO · Seu backlog entrou em velocidade de dobra.' : ''}</p></>;
}
export function AuthPhrases() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer;
    function update() {
      clearInterval(timer);
      if (!media.matches) timer = setInterval(() => { if (document.visibilityState === 'visible') setIndex(old => (old + 1) % authPhrases.length); }, 5000);
    }
    update(); media.addEventListener('change', update);
    return () => { clearInterval(timer); media.removeEventListener('change', update); };
  }, []);
  return <p className="void-phrase"><span key={index}>{authPhrases[index]}</span></p>;
}
