import RecommendWork from './social/RecommendWork';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import Icon from './Icon';
import {GameImage} from './GameUI';
import AddToList from './lists/AddToList';
import {PersonalGameStatus} from './GameStatus';
import DetailModal from './movies/DetailModal';
import {formatRating} from '../lib/catalog';
import {parseRating} from '../lib/ratings';
import {useMovieRelease} from '../lib/use-movie-release';
import {gameHeroImages,gameImageSource,gameImageSet} from '../lib/game-hero';
import {gameGenres} from '../lib/game-filters';
import GameKeyArt from './games/GameKeyArt';
import GameSceneLightbox from './games/GameSceneLightbox';
import {useLibrary} from '../lib/use-library';
import GamePresenceBadge from './games/GamePresenceBadge';

export default function GameDetailHero({item,review,summary,onFavorite,onSection,onRate,keyArtReady=true}){
  const release=useMovieRelease(item),library=useLibrary();
  const images=gameHeroImages(item),[index,setIndex]=useState(0),[modal,setModal]=useState(false),[message,setMessage]=useState('');
  const thumbs=useRef(null);
  const [sceneIndex,setSceneIndex]=useState(null);
  async function share(){try{const url=location.origin+location.pathname;if(navigator.share)await navigator.share({title:item.titulo,url});else{await navigator.clipboard.writeText(url);setMessage('Link do jogo copiado.');}}catch(error){if(error.name!=='AbortError')setMessage('Não foi possível compartilhar. Copie o endereço do navegador.');}}

  function move(direction){setIndex(value=>(value+direction+images.length)%images.length);}
  useEffect(()=>{const box=thumbs.current,button=box?.querySelector('[aria-pressed="true"]');if(box&&button&&index)box.scrollTo({left:button.offsetLeft-box.offsetLeft,top:button.offsetTop-box.offsetTop,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});},[index]);
  const score=parseRating(review?.nota),average=summary.data?.average;
  return <section className="game-hero-full" aria-labelledby="game-full-title">
    <GameKeyArt key={item.id} item={item} ready={keyArtReady}/><div className="game-full-shade"/>
    <div className="game-full-layout"><div className="game-full-copy">
      <Link className="game-full-back" href="/jogos"><Icon name="arrow-left"/> Explorar jogos</Link>
      <p className="game-full-eyebrow">VOID PLAY <span>{item.ano||'ANO NÃO INFORMADO'}</span></p>
      <h1 id="game-full-title">{item.titulo}</h1>
      <GamePresenceBadge record={library.entries[String(item.id)]}/>
      {!!item.plataformas?.length&&<ul className="game-full-platforms" aria-label="Plataformas">{item.plataformas.map(name=><li key={name}>{name}</li>)}</ul>}
      {!!item.generos?.length&&<ul className="game-full-genres" aria-label="Gêneros">{item.generos.map(name=><li key={name}>{gameGenres.find(genre=>genre.names.includes(name))?.label||name}</li>)}</ul>}
      <p className="game-full-description">{item.sinopse||'Ainda não há descrição disponível para este jogo.'}</p>
      <div className="game-full-ratings"><div className="game-full-quick"><span>Sua nota <strong>{Number.isFinite(score)?formatRating(score):'—'} <small>/ 5</small></strong></span>
        <div className="game-full-star-buttons" role="group" aria-label="Escolher uma nota para preencher sua avaliação"><button className="game-zero-rating" disabled={!release.allowed} aria-label="Avaliar com nota zero" onClick={()=>onRate?.(0)}>0</button>{[1,2,3,4,5].map(star=><span className="game-full-star" key={star}><span aria-hidden="true"><Icon name="star"/><span className="game-full-star-fill" style={{width:`${Math.max(0,Math.min(1,(score||0)-star+1))*100}%`}}><Icon name="star"/></span></span>{[star-.5,star].map((value,i)=><button key={value} className={i?'game-half-right':'game-half-left'} aria-label={`Avaliar com nota ${formatRating(value)} de 5`} disabled={!release.allowed} onClick={()=>onRate?.(value)}/>)}</span>)}</div>
        <button type="button" className="game-full-exact-trigger" disabled={!release.allowed} onClick={()=>onSection?.('sua-jornada')}>{review?'Minha avaliação':'Dar uma nota decimal'}</button>
      </div><div className="game-full-community"><span>Comunidade Void</span><strong>{summary.loading?'…':summary.error?'—':formatRating(average)}<small>/ 5</small></strong>{summary.error?<button onClick={summary.refresh}>Tentar novamente</button>:<small>{summary.data?.total?`${summary.data.total} avaliações`:'Sem avaliações públicas'}</small>}</div><div className="game-full-rawg"><span>{item.fonte || 'RAWG'}</span><strong>{formatRating(item.nota)}<small>/ 5</small></strong><small>Nota do catálogo</small></div></div>
      {!release.allowed&&<p className="game-full-notice" role="status">{release.message}</p>}
      <div className="game-full-actions">{release.allowed&&<Link className="game-button" href="#sua-jornada" onClick={event=>{if(onSection){event.preventDefault();onSection('sua-jornada');}}}>{review?'Minha avaliação':'Avaliar jogo'} <Icon name="arrow-up-right"/></Link>}<AddToList item={item}/><button className="gp-hero-action" onClick={onFavorite}><Icon name="heart"/>{review?.favorito?'Favorito':'Favoritar'}</button><button className="gp-hero-action" onClick={share}><Icon name="arrow-up-right"/> Compartilhar</button>{item.trailer&&<button className="game-full-trailer" onClick={()=>setModal(true)} aria-label={`Ver trailer de ${item.titulo}`}><Icon name="play"/><span>Ver trailer</span></button>}</div>
      <RecommendWork item={item} received/>
      <a className="gp-hero-status-link" href="#listas-status" onClick={event=>{if(onSection){event.preventDefault();onSection('listas-status');}}}><Icon name="gamepad"/> Marcar status <Icon name="arrow-right"/></a><div id="game-hero-status" tabIndex={-1}><PersonalGameStatus item={item}/></div><p className="game-full-feedback" role="status" aria-live="polite">{message}</p>
    </div>
    {!!images.length&&<aside className="game-full-scenes" aria-label="Cenas do jogo"><div className="game-full-scenes-heading"><h2>Cenas <a href="#midia" onClick={event=>{if(onSection){event.preventDefault();onSection('midia');}}} aria-label="Abrir galeria"><Icon name="image"/></a></h2><span>{String(index+1).padStart(2,'0')} / {String(images.length).padStart(2,'0')}</span></div><div className="game-full-thumbnails" ref={thumbs}>{images.map((src,i)=><button key={src} aria-label={`Ver cena ${i+1} de ${item.titulo}`} aria-pressed={index===i} onClick={()=>{setIndex(i);setSceneIndex(i);}}><GameImage src={gameImageSource(src,640)} fallbackSrc={src} alt="" loading="lazy"/></button>)}</div><div className="game-full-scene-controls"><div className="game-full-dots">{images.map((src,i)=><button key={src} aria-label={`Selecionar cena ${i+1}`} aria-pressed={index===i} onClick={()=>setIndex(i)}/>)}</div><button aria-label="Cena anterior" onClick={()=>move(-1)} disabled={images.length<2}><Icon name="arrow-left"/></button><button aria-label="Próxima cena" onClick={()=>move(1)} disabled={images.length<2}><Icon name="arrow-right"/></button></div></aside>}
    </div>
    <GameSceneLightbox item={item} images={images} index={sceneIndex} onSelect={value=>{setSceneIndex(value);setIndex(value);}} onClose={()=>setSceneIndex(null)}/>
    {modal&&item.trailer&&createPortal(<DetailModal title={`Trailer · ${item.titulo}`} className="game-full-trailer-modal" onClose={()=>setModal(false)}><video controls autoPlay playsInline preload="metadata" src={item.trailer.url} aria-label={`Trailer de ${item.titulo}`}/></DetailModal>,document.body)}
  </section>;
}
