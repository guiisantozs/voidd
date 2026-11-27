import {useEffect,useState} from 'react';
import Link from 'next/link';
import UniverseArtwork from './UniverseArtwork';
import Icon from '../Icon';
import {movieHref} from '../../lib/movie-sections';
import {marvelUniverse} from '../../config/marvel-universe';
import {doomsdayCountdown,doomsdayProgress} from '../../lib/marvel-universe';

const Artwork=UniverseArtwork;
const theme={'--accent':marvelUniverse.accent,'--accent-soft':marvelUniverse.accentSoft,'--accent-glow':marvelUniverse.accentGlow};
const units=[['days','Dias'],['hours','Horas'],['minutes','Minutos'],['seconds','Segundos']];
const shortDate=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'short',year:'numeric'}).formatToParts(new Date(marvelUniverse.release)).filter(part=>['day','month','year'].includes(part.type)).map(part=>part.value).join(' ');

function Countdown() {
  const [now,setNow]=useState(null);
  useEffect(()=>{const update=()=>setNow(Date.now());update();const timer=setInterval(update,1000);return()=>clearInterval(timer);},[]);
  const countdown=doomsdayCountdown(now),progress=doomsdayProgress(now),percent=progress==null?null:Math.round(progress);
  return <div className="mu-countdown">
    <time className="mu-date-pill" dateTime="2026-12-17"><Icon name="calendar"/><span className="mu-date-full">{marvelUniverse.releaseLabel} · Nos cinemas do Brasil</span><span className="mu-date-short">{shortDate} · Nos cinemas do Brasil</span></time>
    <p><Icon name="clock"/>{countdown?.finished?'A espera acabou':'O próximo encontro tem data marcada'}</p>
    {countdown?.finished?<strong className="mu-countdown-finished">Já em cartaz</strong>:<div className="mu-countdown-values" role="timer" aria-live="off" aria-label={`Contagem regressiva para ${marvelUniverse.releaseLabel}`}>
      {units.map(([key,label])=><div key={key}><strong key={key==='seconds'?countdown?.seconds:key} className={key==='seconds'?'mu-second-number':undefined}>{countdown?String(countdown[key]).padStart(2,'0'):'—'}</strong><span>{label}</span></div>)}
    </div>}
    <div className="mu-launch-progress"><div role="progressbar" aria-label="Caminho até a estreia" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent??undefined}><i style={{width:`${progress??0}%`}}/></div><p>{percent==null?'—':percent}% do caminho até a estreia</p></div>
  </div>;
}

export default function MarvelUniverseHero({media='filmes'}) {
  return <section className="mu-hero mu-doom-hero" aria-labelledby="mu-title" style={theme}>
    <div className="mu-hero-art" aria-hidden="true"><Artwork src={marvelUniverse.hero} fill priority quality={90} sizes="(max-aspect-ratio:16/9) calc(180vh + 176px), 100vw" alt=""/></div><div className="mu-hero-shade" aria-hidden="true"/>
    <div className="mu-embers" aria-hidden="true">{Array.from({length:12},(_,i)=><i key={i} style={{'--ember-x':`${(i*37+11)%100}%`,'--ember-delay':`${-i*1.7}s`,'--ember-duration':`${12+i%5}s`}}/>)}</div><div className="mu-fog" aria-hidden="true"/>
    <div className="m-container mu-hero-copy"><Link className="mu-back" href={media==='series'?'/series/universos':'/universos'}><Icon name="arrow-left"/>{media==='series'?'Universos de séries':'Universos de filmes'}</Link><div className="mu-hero-heading">
      <p className="m-eyebrow">O DESTINO DE TODOS OS UNIVERSOS</p><h1 id="mu-title"><span className="sr-only">Vingadores: Doutor Destino</span><span className="void-home-hero-logo-frame mu-title-logo" aria-hidden="true"><img src={marvelUniverse.titleLogo} alt="" width="1254" height="1254" fetchPriority="high" decoding="async"/></span></h1>
      <p className="mu-hero-intro">Toda saga leva a um novo encontro. Prepare sua maratona para o próximo capítulo dos Vingadores.</p>
    </div><div className="mu-launch">
      <Countdown/>
      <div className="mu-actions"><Link className="m-button" href={movieHref({id:marvelUniverse.doomsdayId})}>Conhecer o filme <Icon name="arrow-right"/></Link><a className="m-button m-button-outline" href="#universo-conteudos">Explorar o MCU <Icon name="chevron-right" className="mu-down"/></a><button type="button" className="mu-reminder" disabled aria-describedby="mu-reminder-note"><Icon name="bell"/>Lembrar-me</button></div>
      <p id="mu-reminder-note" className="mu-reminder-note">Lembretes ainda não disponíveis.</p>

    </div></div>
  </section>;
}
