import { useEffect, useState } from 'react';
import { collectionCoverItem } from '../../lib/collection-presentation';
import { landscapeSources } from '../../lib/gamer-profile';
import GameCover from '../GameCover';

export function CollectionPortrait({ game, decorative = false }) {
 return <GameCover item={collectionCoverItem(game)} decorative={decorative} className="cp-portrait" imageClassName="cp-cover-image"/>;
}

export function GameLandscape({ game, metadata, sources: override, className='', style, decorative=true }) {
 const sources=override||landscapeSources(game,metadata),key=sources.join('|');
 const [index,setIndex]=useState(0);
 useEffect(()=>setIndex(0),[key]);
 return <div className={`cp-landscape ${className}`} style={style}>{sources[index]?<img src={sources[index]} alt={decorative?'':game?.title||'Prévia do banner'} loading="lazy" onError={()=>setIndex(value=>value+1)}/>:<span className="cp-landscape-fallback" aria-hidden={decorative||undefined}>{game?.title?.slice(0,1).toUpperCase()||'V'}</span>}</div>;
}
