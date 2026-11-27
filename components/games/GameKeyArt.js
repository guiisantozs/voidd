import { useEffect, useState } from 'react';
import { keyArtCandidates, usableKeyArt } from '../../lib/game-key-art';
import { useGameCover } from '../../lib/use-game-cover';

export default function GameKeyArt({ item, ready = true }) {
  const cover = useGameCover(item, { preferSeed: false, priority: true });
  const [state, setState] = useState(null), art = state?.id === item.id ? state.art : null;
  useEffect(() => {
    // Store links and IGDB resolve in parallel. Never commit RAWG while Steam's
    // higher-priority candidate is still unknown.
    const candidates = keyArtCandidates(item, cover.data?.cover, { pending: !ready || cover.loading });
    if (!candidates.length) return;
    let alive = true, image;
    (async () => {
      let bestFallback = null;
      for (const candidate of candidates) {
        if (!alive) return;
        try {
          image = new Image(); image.decoding = 'async'; image.src = candidate.url;
          await image.decode(); if (!alive) return;
          if (usableKeyArt(candidate, image.naturalWidth, image.naturalHeight)) { setState({ id: item.id, art: candidate }); return; }
          const pixels = image.naturalWidth * image.naturalHeight;
          if (candidate.fallback && image.naturalWidth >= 960 && image.naturalHeight >= 540 && image.naturalWidth / image.naturalHeight >= 1.35 && pixels > (bestFallback?.pixels || 0)) bestFallback = { ...candidate, pixels };
        } catch { /* Try the next source only after the previous one failed. */ }
      }
      if (alive) setState({ id: item.id, art: bestFallback });
    })();
    return () => { alive = false; if (image) image.src = ''; };
  }, [item.id, item.poster, item.backdrop, item.storePoster?.url, ready, cover.loading, cover.data?.cover?.url, cover.data?.cover?.heroArtwork?.url]);
  return <div className="game-full-background gp-key-art" aria-hidden="true">{art && <img src={art.url} alt="" className="game-full-image" decoding="async" fetchPriority="high" />}</div>;
}
