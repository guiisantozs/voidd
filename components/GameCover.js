import { useEffect, useState } from 'react';
import { useVisibleSection } from '../lib/use-visible-section';
import { useGameCover } from '../lib/use-game-cover';
import { gameCoverPresentation, gameCoverImageSet, gameCoverIdentity } from '../lib/game-cover-client';

export default function GameCover({ item, portraitOnly = false, className = '', imageClassName = '', decorative = false, eager = false, sizes = '(max-width:600px) 45vw, (max-width:1100px) 25vw, 220px' }) {
  const [ref, visible] = useVisibleSection(!eager), state = useGameCover(item, { enabled: eager || visible });
  const identity=gameCoverIdentity(item);
  const [failures, setFailures] = useState({ identity, urls: [] });
  const [loaded, setLoaded] = useState(null);
  const [direct,setDirect]=useState(null);
  const failed = failures.identity === identity ? failures.urls : [], image = gameCoverPresentation(item, state, { portraitOnly, failed });
  const imageKey=identity+':'+image.url, original=direct===imageKey;
  const fail = () => {
    // A broken responsive thumbnail does not mean the original cover is broken.
    if(image.source==='IGDB'&&!original){setDirect(imageKey);setLoaded(null);return;}
    setFailures(old => ({ identity, urls: [...(old.identity === identity ? old.urls : []), image.url] }));
  };
  useEffect(() => {
    if (!state.error && !failed.length) return;
    const refresh = () => { setFailures({ identity, urls: [] });setDirect(null);state.retry(); };
    window.addEventListener('online', refresh); window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('online', refresh); window.removeEventListener('focus', refresh); };
  }, [state.error, failed.length, identity]);
  const alt = decorative?'':`Capa de ${item.titulo}`, loading = eager ? 'eager' : 'lazy';
  const imagePending=!!image.url&&(loaded?.identity!==identity||loaded?.url!==image.url);
  const onLoad=()=>setLoaded({identity,url:image.url});
  return <div ref={ref} className={`game-portrait-cover ${className}`} data-cover-source={image.source || undefined} data-image-pending={imagePending} aria-hidden={decorative||undefined} aria-busy={image.kind === 'loading'||imagePending}>
    {image.kind === 'portrait' ? <img key={imageKey+(original?':original':'')} className={imageClassName} src={image.url} srcSet={original?undefined:gameCoverImageSet(image)} sizes={sizes} alt={alt} title={`Capa: ${image.source}`} loading={loading} decoding="async" width={528} height={748} onLoad={onLoad} onError={fail} /> : image.kind === 'landscape' ? <div className="game-cover-landscape" style={{'--cover-landscape-image':`url(${JSON.stringify(image.url)})`}}><img key={imageKey} className={imageClassName} src={image.url} alt={alt} title={`Arte: ${image.source}`} loading={loading} decoding="async" onLoad={onLoad} onError={fail} /></div> : image.kind === 'loading' ? <div className="game-cover-skeleton" role="img" aria-label={`Carregando capa de ${item.titulo}`} /> : <div className={`game-cover-unavailable${portraitOnly ? ' gu-cover-placeholder' : ''}`} role="img" aria-label={`Capa indisponível de ${item.titulo}`}><span aria-hidden="true">void.</span><small>{portraitOnly ? item.titulo : 'Imagem indisponível'}</small></div>}
    {imagePending&&<div className="game-cover-skeleton game-cover-image-loading" aria-hidden="true"/>}
  </div>;
}
