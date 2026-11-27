import { useState } from 'react';
import { createPortal } from 'react-dom';
import DetailModal from '../movies/DetailModal';
import Icon from '../Icon';
import { GameImage } from '../GameUI';
import GameSceneLightbox from './GameSceneLightbox';
import { gameHeroImages, gameImageSource } from '../../lib/game-hero';

export default function GameMedia({ item }) {
  const images = gameHeroImages(item), [index, setIndex] = useState(null), [trailer, setTrailer] = useState(false);
  return <section className="gp-section" id="midia" aria-labelledby="gp-media-title"><div className="gp-section-heading"><div><p className="gp-overline">UM OLHAR PARA DENTRO</p><h2 id="gp-media-title">Mídia e screenshots</h2></div>{item.trailer && <button className="game-button-outline" onClick={() => setTrailer(true)}><Icon name="play"/> Ver trailer</button>}</div>
    {images.length ? <div className="gp-media-grid">{images.map((src, i) => <button key={src} onClick={() => setIndex(i)} aria-label={`Ampliar imagem ${i + 1} de ${item.titulo}`}><GameImage src={gameImageSource(src, 640)} fallbackSrc={src} loading="lazy" alt={`Cena ${i + 1} de ${item.titulo}`}/><span><Icon name="image"/> {String(i + 1).padStart(2, '0')}</span></button>)}</div> : <div className="gp-empty"><Icon name="image"/><h3>As imagens ainda não chegaram.</h3><p>O catálogo ainda não disponibilizou mídia para este jogo.</p></div>}
    <GameSceneLightbox item={item} images={images} index={index} onSelect={setIndex} onClose={()=>setIndex(null)}/>
    {trailer && createPortal(<DetailModal title={`Trailer · ${item.titulo}`} className="game-full-trailer-modal" onClose={() => setTrailer(false)}><video controls autoPlay playsInline preload="metadata" src={item.trailer.url} aria-label={`Trailer de ${item.titulo}`}/></DetailModal>, document.body)}
  </section>;
}
