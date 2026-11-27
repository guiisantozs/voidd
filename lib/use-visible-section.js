import { useEffect, useRef, useState } from 'react';

// Defer offscreen sections; keep the content available once visited.
export function useVisibleSection(enabled=true) {
  const ref = useRef(null), [visible, setVisible] = useState(false);
  useEffect(() => {
    if(!enabled)return;
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '180px' });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [enabled]);
  return [ref, visible];
}
