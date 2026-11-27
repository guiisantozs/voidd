import Icon from './Icon';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatRating, itemKey } from '../lib/catalog';
import { workHref } from '../lib/work-client';
import GameStatus from './GameStatus';
import GameCover from './GameCover';

export function rememberGame(item) {
  try { sessionStorage.setItem(`void:item:${itemKey(item)}`, JSON.stringify(item)); } catch { /* Navigation also resolves the catalogue ID. */ }
}

export function GameImage({ src, fallbackSrc, alt = '', className = '', loading, fetchPriority, srcSet, sizes, onLoad, onError }) {
  const [failed, setFailed] = useState(false);
  const [original, setOriginal] = useState(false);
  useEffect(() => { setFailed(false); setOriginal(false); }, [src, fallbackSrc]);
  return src && !failed ? <img className={className} src={original ? fallbackSrc : src} srcSet={original ? undefined : srcSet} sizes={sizes} alt={alt} loading={loading} fetchPriority={fetchPriority} decoding="async" onLoad={onLoad} onError={event => {
    if (!original && fallbackSrc && fallbackSrc !== src) setOriginal(true);
    else { setFailed(true); onError?.(event); }
  }} />
    : <div className={`game-image-empty ${className}`} role={alt ? 'img' : undefined} aria-label={alt || undefined}><span>v.</span></div>;
}

export function GamesHeader() {
  const {asPath}=useRouter();
  const [bar, setBar] = useState(null);
  useEffect(() => { setBar(document.querySelector('.account-bar')); }, []);
  const current=asPath.split('#')[0].split('?')[0]==='/jogos'&&asPath.split('#')[1]==='game-search-title'?'buscar':asPath.startsWith('/jogos/avaliacoes')?'avaliacoes':(asPath.startsWith('/jogos/colecao')||asPath.startsWith('/jogos/conquistas'))?'colecao':asPath.startsWith('/jogos/universos')?'universos':asPath.startsWith('/jogos/listas')?'listas':asPath.split(/[?#]/)[0]==='/jogos/biblioteca'?'biblioteca':asPath.split(/[?#]/)[0]==='/jogos'?'explorar':null;
  const navigation=<nav className="games-top-nav" aria-label="Navegação de jogos">{[['explorar','Explorar','/jogos'],['universos','Universos','/jogos/universos'],['avaliacoes','Avaliações','/jogos/avaliacoes'],['buscar','Buscar','/jogos#game-search-title'],['biblioteca','Minha Biblioteca','/jogos/biblioteca'],['colecao','Minha Coleção','/jogos/colecao'],['listas','Listas','/jogos/listas'],['inicio','Início','/']].map(([key,label,href])=><Link key={key} href={href} aria-current={current===key?'page':undefined}>{label}{key==='inicio'&&<Icon name="arrow-up-right"/>}</Link>)}</nav>;
  return <><header className="games-site-header">{!bar&&navigation}</header>{bar&&createPortal(navigation,bar)}</>;
}

export function GameCard({ item, review, library }) {
  return <article className="game-card"><Link href={workHref(item)} onClick={() => {
    try { sessionStorage.setItem(`void:item:${itemKey(item)}`, JSON.stringify(item)); } catch { /* Navegação por ID continua disponível. */ }
  }}><div className="game-card-art"><GameCover item={item}/><span className="game-card-open"><Icon name="arrow-up-right" /></span>{review && <span className="game-played">{"AVALIADO "}<Icon name="check" /></span>}</div><div className="game-card-body"><p className="game-card-type">{item.generos?.slice(0, 2).join(' / ') || 'Descobrir'}<span>{item.ano}</span></p><h3>{item.titulo}</h3><div className="game-card-bottom"><span>{item.plataformas?.slice(0, 2).join(' · ') || 'Ver plataformas'}</span><strong><Icon name="star" />{" "}{formatRating(item.nota)}</strong></div></div></Link>{library && <GameStatus item={item} library={library} />}</article>;
}

export function GamesFooter() {
  return <footer className="games-footer"><Link className="logo" href="/">void<span><Icon name="dot" /></span></Link><p>Jogos, avaliações e favoritos.</p><span>Dados e capas: <a href="https://www.igdb.com/" target="_blank" rel="noopener noreferrer">IGDB</a> · <a href="https://rawg.io/" target="_blank" rel="noopener noreferrer">RAWG</a> · Artes editoriais: Steam</span></footer>;
}
