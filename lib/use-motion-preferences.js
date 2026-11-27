import { useEffect, useState } from 'react';

export function useMotionPreferences() {
  const [motion, setMotion] = useState({ reduced: true, hidden: true });
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setMotion({ reduced: query.matches, hidden: document.hidden });
    update();
    query.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    return () => { query.removeEventListener('change', update); document.removeEventListener('visibilitychange', update); };
  }, []);
  return motion;
}
