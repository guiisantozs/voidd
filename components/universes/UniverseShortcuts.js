import Icon from '../Icon';
import Link from 'next/link';
import { useRef } from 'react';
import { franchises } from '../../franchises.config';
import UniverseLogo from './UniverseLogo';
import {seriesUniverseHref} from '../../lib/shared-universes';

export default function UniverseShortcuts({ items = franchises, basePath = '/universos', media = 'filmes', id = 'universe-shortcuts-title' }) {
  const track = useRef(null);
  const scroll = direction => track.current?.scrollBy({ left: direction * track.current.clientWidth * .8, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });

  return <section className={`u-shortcuts m-container${media === 'jogos' ? ' gu-shortcuts' : ''}`} aria-labelledby={id}>
    <div className="u-shortcuts-heading">
      <h2 id={id}>Explore os universos</h2>
      <Link href={basePath}>Ver todos <span aria-hidden="true"><Icon name="arrow-up-right" /></span></Link>
    </div>
    {!items.length?<p className="m-empty">Os universos de animes estão a caminho. Nenhum universo cadastrado por enquanto.</p>:<div className="u-shortcuts-carousel">
      <button type="button" className="u-shortcuts-arrow u-shortcuts-prev" aria-label="Universos anteriores" onClick={() => scroll(-1)}><Icon name="chevron-left" /></button>
      <nav className="u-shortcuts-track" ref={track} aria-label={`Universos de ${media}`}>
        {items.map(franchise => <Link key={franchise.slug} href={media==='series'?seriesUniverseHref(franchise.slug):`${basePath}/${franchise.slug}`} aria-label={`Explorar ${franchise.nome}`} className={`u-shortcut u-shortcut-${franchise.slug}`} style={{ '--tile-accent': franchise.cor }}>
          <span className="u-shortcut-orbit" aria-hidden="true" />
          {franchise.logo ? <UniverseLogo logo={franchise.logo} /> : <span className="u-shortcut-name">{franchise.nome}</span>}
          {media === 'jogos' && franchise.logo && <span className="gu-logo-text">{franchise.nome}</span>}
          <span className="u-shortcut-explore" aria-hidden="true">{"Explorar universo "}<Icon name="arrow-up-right" /></span>
        </Link>)}
      </nav>
      <button type="button" className="u-shortcuts-arrow u-shortcuts-next" aria-label="Próximos universos" onClick={() => scroll(1)}><Icon name="chevron-right" /></button>
    </div>}
  </section>;
}
