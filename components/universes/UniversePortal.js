import Link from 'next/link';
import { useState } from 'react';
import Icon from '../Icon';
import UniverseLogo from './UniverseLogo';
import UniverseArtwork from './UniverseArtwork';
import { UniverseProgress } from './UniverseUI';
import { movieUniversePortal } from '../../config/movie-universe-portal';
import { movieUniverseSrcSet } from '../../lib/universe-backdrop';
import { nextUniverseMovie } from '../../lib/movie-universe-portal';
import {seriesUniverseHref} from '../../lib/shared-universes';
const universeHref=(slug,media,basePath)=>media==='series'?seriesUniverseHref(slug):`${basePath}/${slug}`;

function Identity({ row, priority = false, portal=movieUniversePortal }) {
  const logo = portal[row.slug]?.logo;
  return logo ? <span className="up-logo" role="img" aria-label={`Logo de ${row.nome}`}><UniverseLogo logo={logo} priority={priority}/></span> : <span className="up-logo up-logo-fallback">{row.nome}</span>;
}
function Backdrop({ row, featured = false, wide = false, portal=movieUniversePortal }) {
  const [failed, setFailed] = useState(false);
  const config = portal[row.slug];
  const source = config?.artwork || row.backdrop;
  const sizes = featured ? '(max-width:650px) max(88vw, 800px), 88vw' : `(max-width:650px) 88vw, (max-width:1100px) 44vw, ${wide ? '59vw' : '29vw'}`;
  if (!source || failed) return null;
  return <div className="up-backdrop" aria-hidden="true">{config?.artwork ?
    <UniverseArtwork src={source} fill sizes={sizes} priority={featured} onError={() => setFailed(true)} style={{objectPosition:config.position}}/> :
    <img src={source} srcSet={movieUniverseSrcSet(source)} sizes={sizes} alt="" loading={featured ? 'eager' : 'lazy'} fetchPriority={featured ? 'high' : undefined} decoding="async" onError={() => setFailed(true)}/>
  }</div>;
}
function Media({ row, portal=movieUniversePortal, media='filmes' }) {
  const labels = { filmes:'Filmes', series:'Séries', jogos:'Jogos', animes:'Animes' };
  return <span className="up-media">{(portal[row.slug]?.media || [media]).map(key => labels[key]).join(' · ')}</span>;
}
function Progress({ row, unavailable, media='filmes' }) {
  return unavailable ? <p className="up-progress-error">Progresso indisponível</p> : <UniverseProgress label={media==='series'?`Você avaliou ${row.seen} de ${row.total} ${row.total===1?'série':'séries'}`:undefined} seen={row.seen} total={row.total} description={`Progresso em ${row.nome}`}/>;
}
export function UniverseFeatured({ row, reviews, unavailable, onActivate, portal=movieUniversePortal, media='filmes', basePath='/universos' }) {
  const config = portal[row.slug];
  const next = unavailable ? null : nextUniverseMovie(row, reviews, config?.chronology, media);
  const href = next ? `/obra/${media}/${next}` : universeHref(row.slug,media,basePath);
  return <section className="up-featured" aria-labelledby="up-featured-title" style={{'--up-accent':config?.accent || row.cor}} onMouseEnter={() => onActivate(row.cor)} onMouseLeave={() => onActivate(null)} onFocusCapture={() => onActivate(row.cor)} onBlurCapture={event => {if (!event.currentTarget.contains(event.relatedTarget)) onActivate(null);}}>
    <Backdrop row={row} featured portal={portal}/>
    <div className="up-featured-copy">
      <p className="up-kicker">{row.seen && !unavailable ? 'A SUA HISTÓRIA CONTINUA' : 'SEU PRÓXIMO UNIVERSO'}</p>
      <h2 id="up-featured-title" className="sr-only">{row.nome}</h2>
      <Identity row={row} priority portal={portal}/>
      <p className="up-invitation">{config?.invitation || row.nome}</p>
      <div className="up-featured-progress"><strong>{unavailable ? '—' : `${Math.round(row.ratio * 100)}%`}</strong><Progress row={row} unavailable={unavailable} media={media}/></div>
      <div className="up-featured-actions"><Link className="up-continue" href={href}>{unavailable ? 'Explorar universo' : row.complete ? 'Revisitar universo' : row.seen ? 'Continuar universo' : 'Começar universo'}<Icon name="arrow-up-right"/></Link><Link href={universeHref(row.slug,media,basePath)}>Conhecer universo <Icon name="arrow-right"/></Link></div>
      {next && <small>{media==='series'?'Próxima série não avaliada':'Próximo filme não avaliado'} · {config?.chronology?.length ? 'ordem cronológica' : 'ordem de lançamento'}</small>}
      {row.partial&&<small>Catálogo parcial · o progresso considera os títulos carregados.</small>}
    </div>
    <span className="up-featured-caption"><Media row={row} portal={portal} media={media}/> <span>{row.total} capítulos para explorar</span></span>
  </section>;
}
export function UniversePortalCard({ row, index, wide, unavailable, retry, loading, onActivate, portal=movieUniversePortal, media='filmes', basePath='/universos' }) {
  const config = portal[row.slug];
  return <article className={`up-card${wide ? ' up-card--wide' : ''}`} style={{'--up-accent':config?.accent || row.cor,'--up-delay':`${Math.min(index, 8) * 45}ms`}} onMouseEnter={() => onActivate(row.cor)} onMouseLeave={() => onActivate(null)} onFocusCapture={() => onActivate(row.cor)} onBlurCapture={event => {if (!event.currentTarget.contains(event.relatedTarget)) onActivate(null);}}>
    {row.error ? <div className="up-card-error"><Identity row={row} portal={portal}/><h3>{row.nome}</h3><p>Este universo está indisponível agora.</p><button type="button" onClick={retry} disabled={loading}>Tentar novamente</button></div> : <Link href={universeHref(row.slug,media,basePath)} className="up-card-link" aria-label={`Explorar ${row.nome}${row.complete ? ', universo completo' : ''}`}>
      <Backdrop row={row} wide={wide} portal={portal}/>
      <div className="up-card-top"><Media row={row} portal={portal} media={media}/>{row.complete && !unavailable ? <span className="up-complete">Universo completo</span> : <Icon name="arrow-up-right"/>}</div>
      <Identity row={row} portal={portal}/>
      <div className="up-card-bottom"><div className="up-card-heading"><h3>{row.nome}</h3><span>{row.total} {media==='series'?(row.total===1?'série':'séries'):'filmes'}</span></div><Progress row={row} unavailable={unavailable} media={media}/>
        {row.previews?.length > 0 && <div className="up-previews" aria-label={media==='series'?'Séries deste universo':'Alguns filmes deste universo'}>{row.previews.map(movie => <img key={movie.id} src={movie.poster} alt={movie.titulo} width="54" height="81" loading="lazy" decoding="async" onError={event => {event.currentTarget.style.visibility = 'hidden';}}/>)}<span aria-hidden="true">Explorar <Icon name="arrow-right"/></span></div>}
        {row.partial && <small className="up-partial">Catálogo parcial · tente atualizar mais tarde</small>}
      </div>
    </Link>}
  </article>;
}
export function UniversePortalSkeleton() {
  return <div className="up-loading" role="status" aria-label="Carregando universos"><div className="up-featured m-skeleton"/><div className="up-grid">{Array.from({length:6}, (_, index) => <div key={index} className={`up-card m-skeleton${index === 0 ? ' up-card--wide' : ''}`}/>)}</div></div>;
}
