import { useEffect, useRef } from 'react';

export default function HomeMotion({ children, className = '' }) {
  const root = useRef(null);
  useEffect(() => {
    const element = root.current, media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!element || !('IntersectionObserver' in window) || media.matches || element.getBoundingClientRect().top < innerHeight) return;
    element.classList.add('is-pending');
    const show = () => { element.classList.remove('is-pending'); observer.disconnect(); };
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) show(); }, { threshold: .08 });
    observer.observe(element); media.addEventListener('change', show);
    return () => { observer.disconnect(); media.removeEventListener('change', show); element.classList.remove('is-pending'); };
  }, []);
  return <div className={`void-home-reveal ${className}`} ref={root}>{children}</div>;
}
