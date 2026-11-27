import { useEffect,useRef } from 'react';
import { createPortal } from 'react-dom';
import DetailModal from '../movies/DetailModal';
import Icon from '../Icon';
import { GameImage } from '../GameUI';

export default function GameSceneLightbox({ item, images, index, onSelect, onClose }) {
  const pointer=useRef(null);
  const move = direction => onSelect((index + direction + images.length) % images.length);
  useEffect(() => {
    if (index == null) return;
    const key = event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); } };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [index, images.length]);
  if (index == null || !images[index]) return null;
  return createPortal(<DetailModal title={`${item.titulo} · ${index + 1} / ${images.length}`} className="gp-lightbox" onClose={onClose}><div className="go-lightbox-image" onTouchStart={event=>{pointer.current={x:event.touches[0].clientX,y:event.touches[0].clientY};}} onTouchCancel={()=>{pointer.current=null;}} onTouchEnd={event=>{const start=pointer.current;pointer.current=null;if(!start)return;const dx=event.changedTouches[0].clientX-start.x,dy=event.changedTouches[0].clientY-start.y;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy))move(dx<0?1:-1);}}><GameImage key={images[index]} src={images[index]} alt={`Cena ${index + 1} de ${item.titulo}`}/></div><div className="gp-lightbox-controls"><button disabled={images.length < 2} onClick={() => move(-1)}><Icon name="arrow-left"/> Anterior</button><span>Use também as setas do teclado</span><button disabled={images.length < 2} onClick={() => move(1)}>Próxima <Icon name="arrow-right"/></button></div></DetailModal>, document.body);
}
