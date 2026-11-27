import { useState } from 'react';
import GameCover from './GameCover';
export default function Poster({ item, sizes }) {
  const [failed, setFailed] = useState(false);
  if(item.categoria==='jogos')return <div className="poster"><GameCover item={item} sizes={sizes}/></div>;
  return <div className="poster">{item.poster && !failed
    ? <img src={item.poster} alt={`Capa de ${item.titulo}`} loading="lazy" onError={() => setFailed(true)} />
    : <span className="poster-fallback">{item.titulo}<small>Capa indisponível</small></span>}</div>;
}
