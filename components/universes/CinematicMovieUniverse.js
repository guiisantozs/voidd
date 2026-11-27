import Link from 'next/link';
import Icon from '../Icon';
import UniverseLogo from './UniverseLogo';
import UniverseArtwork from './UniverseArtwork';
import {UniverseProgress} from './UniverseUI';
import {franchiseBySlug} from '../../franchises.config';
import {franchiseProgress} from '../../lib/franchise-model';
import {formatRating} from '../../lib/catalog';

// Shared cinematic layout; each universe supplies artwork, copy and its theme.
export default function CinematicMovieUniverse({data,average,reviews,user,landing,showNavigation=true,media='filmes',shared=false}) {
 const {prefix}=landing,franchise=franchiseBySlug(landing.slug);
 return <div className="sw-landing">
  <section className="sw-hero" aria-labelledby={`${prefix}-title`}>
   <div className="sw-hero-art" aria-hidden="true"><UniverseArtwork src={landing.hero} priority sizes={landing.heroSizes} style={landing.heroStyle}/></div>
   <div className="m-container sw-hero-copy">
    <Link className="sw-back" href={media==='series'?'/series/universos':'/universos'}><Icon name="arrow-left"/> Todos os universos</Link>
    <div className="sw-hero-heading">
     <p className="sw-eyebrow">{landing.eyebrow}</p>
     <h1 id={`${prefix}-title`}><span className="sr-only">{franchise.nome}</span><UniverseLogo logo={franchise.logo} priority/></h1>
     <p className="sw-tagline">{landing.tagline[0]}<br/>{landing.tagline[1]}</p>
     <div className="sw-actions"><a className="sw-primary" href={`#${prefix}-filmes`}>Explorar a saga <Icon name="arrow-right"/></a><a href={`#${prefix}-sobre`}>Conhecer o universo</a></div>
    </div>
    <a className="sw-discover" href={`#${prefix}-sobre`}>{landing.discover} <Icon name="arrow-right"/></a>
   </div>
  </section>
  {showNavigation&&<nav className="sw-nav" aria-label={landing.navLabel}><a href={`#${prefix}-sobre`}>O universo</a><a href={`#${prefix}-filmes`}>{shared?'Séries e filmes':'Filmes da saga'} <Icon name="arrow-right"/></a></nav>}
  <section id={`${prefix}-sobre`} className="sw-about" aria-labelledby={`${prefix}-about-title`}>
   <div className="sw-about-art" aria-hidden="true"><UniverseArtwork src={landing.about} sizes={landing.aboutSizes} style={landing.aboutStyle}/></div>
   <div className="m-container sw-about-copy">
    <p className="sw-eyebrow">{landing.aboutEyebrow}</p>
    <h2 id={`${prefix}-about-title`}>{landing.aboutTitle[0]}<br/><em>{landing.aboutTitle[1]}</em></h2>
    {landing.description.map(paragraph=><p key={paragraph}>{paragraph}</p>)}
    <div className="sw-facts"><div><strong>{data.total}</strong><span>filmes no catálogo</span></div><div><strong>{average.loading?'…':formatRating(average.rating)} <small>/ 5</small></strong><span>na comunidade Void</span></div></div>
    {average.error?<p className="sw-note">Nota da comunidade indisponível.</p>:!average.loading&&average.rating===null&&<p className="sw-note">Ainda não há avaliações públicas desta franquia.</p>}
    {user?<UniverseProgress seen={franchiseProgress(data.movies.map(movie=>movie.id),reviews)} total={data.total}/>:<Link className="sw-login" href="/conta">Entre para acompanhar seu progresso <Icon name="arrow-right"/></Link>}
   </div>
  </section>
 </div>;
}
