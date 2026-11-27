import {useEffect,useId,useRef,useState} from 'react';
import Icon from '../Icon';
import GameCover from '../GameCover';
import {GameImage,rememberGame} from '../GameUI';
import Link from 'next/link';
import {workHref} from '../../lib/work-client';
import {OVERVIEW_REVEAL_MS,OVERVIEW_REVEAL_STEP_MS} from '../../lib/game-overview';

export function OverviewBlock({name,title,order=0,children,className=''}){
  const root=useRef(null),[visible,setVisible]=useState(false),id=useId();
  useEffect(()=>{if(!('IntersectionObserver'in window)){setVisible(true);return;}const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'40px'});if(root.current)observer.observe(root.current);return()=>observer.disconnect();},[]);
  return <section ref={root} className={`gp-panel go-block ${className}${visible?' is-visible':''}`} data-block={name} aria-labelledby={title?id:undefined} style={{'--go-order':order,'--go-reveal':`${OVERVIEW_REVEAL_MS}ms`,'--go-delay':`${Math.min(order,4)*OVERVIEW_REVEAL_STEP_MS}ms`}}>{title&&<h2 id={id}>{title}</h2>}{children}</section>;
}
export function OverviewSkeleton({name,title,order}){return <OverviewBlock name={name} title={title} order={order}><div role="status" aria-label={`Carregando ${title.toLowerCase()}`} className="go-skeleton"><span className="m-skeleton"/><span className="m-skeleton"/><span className="m-skeleton"/></div></OverviewBlock>;}
export function OverviewFailure({title,order,retry}){return <OverviewBlock title={title} order={order}><p className="gp-subtle" role="status">Este bloco está indisponível. <button className="gp-text-button" onClick={retry}>Tentar novamente</button></p></OverviewBlock>;}
export function OverviewPosterRow({games,label}){
  const track=useRef(null),[edges,setEdges]=useState({start:true,end:false});
  const measure=()=>{const el=track.current;if(el)setEdges({start:el.scrollLeft<2,end:el.scrollLeft+el.clientWidth>=el.scrollWidth-2});};
  useEffect(()=>{measure();const el=track.current;if(!el)return;const observer=new ResizeObserver(measure);observer.observe(el);return()=>observer.disconnect();},[games]);
  const move=direction=>{const el=track.current;el?.scrollBy({left:direction*el.clientWidth*.85,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};
  return <div className="go-poster-carousel"><button className="upcoming-arrow upcoming-prev" aria-label={`Anteriores: ${label}`} disabled={edges.start} onClick={()=>move(-1)}><Icon name="chevron-left"/></button><div className="go-poster-row" ref={track} tabIndex={0} role="region" aria-label={label} onScroll={measure}>{games.map(item=><article key={item.id}><Link href={workHref(item)} onClick={()=>rememberGame(item)}><div className="go-poster"><GameCover item={item}/></div><h3>{item.titulo}</h3></Link></article>)}</div><button className="upcoming-arrow upcoming-next" aria-label={`Próximos: ${label}`} disabled={edges.end} onClick={()=>move(1)}><Icon name="chevron-right"/></button></div>;
}
export function OverviewGallery({item,images,onOpen}){
  const track=useRef(null),[loaded,setLoaded]=useState({});
  const move=direction=>{const el=track.current;el?.scrollBy({left:direction*el.clientWidth*.8,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};
  return <div className="go-gallery"><button className="upcoming-arrow upcoming-prev" aria-label="Imagens anteriores" onClick={()=>move(-1)}><Icon name="chevron-left"/></button><div className="go-gallery-track" ref={track} tabIndex={0} role="region" aria-label="Screenshots do jogo">{images.map((src,index)=><button key={src} className={loaded[src]?'':'m-skeleton'} onClick={()=>onOpen(index)} aria-label={`Ampliar screenshot ${index+1} de ${item.titulo}`}><GameImage src={src} alt={`Cena ${index+1} de ${item.titulo}`} loading="lazy" onLoad={()=>setLoaded(old=>({...old,[src]:true}))} onError={()=>setLoaded(old=>({...old,[src]:true}))}/><span><Icon name="image"/> {index+1}</span></button>)}</div><button className="upcoming-arrow upcoming-next" aria-label="Próximas imagens" onClick={()=>move(1)}><Icon name="chevron-right"/></button></div>;
}
