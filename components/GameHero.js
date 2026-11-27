import Link from 'next/link';
import { useState } from 'react';
import Icon from './Icon';
import CatalogHero from './CatalogHero';
import { GameImage } from './GameUI';
import { itemKey } from '../lib/catalog';

function remember(highlight) {
  if (!highlight.item) return;
  try { sessionStorage.setItem(`void:item:${itemKey(highlight.item)}`, JSON.stringify(highlight.item)); } catch { /* Navigation also resolves the catalogue ID. */ }
}

function Identity({ highlight, as: Heading = 'h1' }) {
  const [failed, setFailed] = useState(false);
  const image = <img className={highlight.logoCrop ? 'game-highlight-logo-cropped' : 'game-highlight-logo'} src={highlight.logo} alt={highlight.title} style={highlight.logoCrop ? {width:highlight.logoCrop.width,left:highlight.logoCrop.left,top:highlight.logoCrop.top} : undefined} width={highlight.logoCrop?.sourceWidth} height={highlight.logoCrop?.sourceHeight} decoding="async" onError={() => setFailed(true)} />;
  return <Heading className="game-highlight-identity">{highlight.logo && !failed ? highlight.logoCrop ? <span className="game-highlight-logo game-highlight-logo-frame" style={{aspectRatio:highlight.logoCrop.aspectRatio}}>{image}</span> : image : highlight.title}</Heading>;
}

function Actions({ highlight, hero = false }) {
  const actions = [highlight.primary, highlight.secondary, highlight.trailerUrl && { label: 'Assistir trailer', href: highlight.trailerUrl }].filter(Boolean);
  return <div className={hero ? "void-home-hero-actions" : "game-spotlight-actions"}>{actions.map((action, index) => <Link key={`${action.label}:${action.href}`} className={hero ? index ? 'void-home-hero-secondary' : 'void-home-hero-cta' : index ? 'game-button-outline' : 'game-button'} href={action.href} onClick={() => remember(highlight)} {...(/^https?:\/\//.test(action.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{action.label}<Icon name={action.label.includes('Avaliar') ? 'star' : 'arrow-up-right'} /></Link>)}</div>;
}

const framing = highlight => ({ '--highlight-position': highlight.position || 'center', '--highlight-mobile-position': highlight.mobilePosition || highlight.position || 'center' });

export default function GameHero({ highlights = [] }) {
  if (!highlights.length) return null;
  return <CatalogHero items={highlights} label="Jogos em destaque" className="void-catalog-hero--games"
    renderImage={(item, {priority,onLoad,onError}) => <GameImage src={item.background} loading="eager" fetchPriority={priority?'high':'low'} onLoad={onLoad} onError={onError}/>}
    renderContent={highlight => <>
      <p className="void-home-hero-eyebrow">DESTAQUE VOID <span/>JOGOS</p>
      <div className="void-home-hero-selection"><Identity key={highlight.id+':'+highlight.logo} highlight={highlight}/>{highlight.logo && <p className="void-home-hero-feature-name">{highlight.title}</p>}</div>
      {highlight.description && <p className="void-home-hero-description">{highlight.description}</p>}
      <Actions highlight={highlight} hero/>
      {highlight.credit && <p className="void-catalog-hero-credit">{highlight.creditUrl ? <a href={highlight.creditUrl} target="_blank" rel="noopener noreferrer">{highlight.credit} <Icon name="arrow-up-right"/></a> : highlight.credit}</p>}
    </>}/>;
}

export function GameHighlightGallery({ highlights = [] }) {
  if (!highlights.length) return null;
  return <section className="game-highlight-gallery" aria-labelledby="game-highlights-title"><div className="game-section-heading"><h2 id="game-highlights-title">Jogos em destaque</h2><p>Grandes mundos. Novas jornadas.</p></div><div className="game-highlight-track" tabIndex={0} role="region" aria-label="Artes dos jogos em destaque">{highlights.map(highlight => <article className="game-highlight-tile" key={highlight.id} style={framing(highlight)}><GameImage className="game-highlight-art" src={highlight.background} alt={`Arte de ${highlight.title}`} loading="lazy" /><div className="game-highlight-tile-copy"><Identity as="h3" key={`${highlight.id}:${highlight.logo}`} highlight={highlight} /><p>{highlight.description}</p><Actions highlight={highlight} /></div></article>)}</div></section>;
}
