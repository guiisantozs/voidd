import Link from 'next/link';
import Icon from '../Icon';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';

const links=[
  ['filmes','Filmes','/filmes'],
  ['universos','Universos','/universos'],
  ['avaliacoes','Avaliações','/avaliacoes'],
  ['buscar','Buscar','/filmes#buscar-filmes'],
  ['cartaz','Em cartaz','/filmes#em-cartaz'],
  ['lancamentos','Lançamentos','/filmes#movie-upcoming'],
  ['amigos','Amigos','/amigos'],
  ['listas','Listas','/listas'],
  ['explorar','Explorar o VOID','/'],
];
const homeLinks=[
  ['filmes','Filmes','/filmes'],
  ['jogos','Jogos','/jogos'],
  ['series','Séries','/series'],
  ['animes','Animes','/animes'],
  ['amigos','Amigos','/amigos'],
];
const seriesLinks=[['series','Séries','/series'],['universos','Universos','/series/universos'],['avaliacoes','Avaliações','/series/avaliacoes'],['inicio','Início','/'],['amigos','Amigos','/amigos'],['listas','Listas','/series/listas']];

export default function MovieHeader({current='filmes',overlay=false,back,utilityNavigation=true,home=false,seriesOnly=false,media='series'}) {
  const [bar,setBar]=useState(null);
  const {asPath}=useRouter();
  const [path,hash]=asPath.split('#');
  const active=path.split('?')[0]==='/filmes'?({'buscar-filmes':'buscar','em-cartaz':'cartaz','movie-upcoming':'lancamentos'}[hash]||current):current;
  useEffect(()=>{setBar(utilityNavigation?document.querySelector('.account-bar'):null);},[utilityNavigation]);
  const catalogLinks=media==='animes'?seriesLinks.map(([key,label,href])=>[key==='series'?'animes':key,key==='series'?'Animes':label,href.replace('/series','/animes')]):seriesLinks;
  const navigation=<nav className={`${utilityNavigation?'movie-top-nav':''}${home?' home-top-nav':''}`} aria-label="Navegação principal">{(seriesOnly?catalogLinks:home?homeLinks:links).map(([key,label,href])=>href?<Link key={key} href={href} aria-current={active===key?'page':undefined}>{label}{key==='explorar'&&<> <Icon name="arrow-up-right"/></>}</Link>:<span key={key} className="home-top-nav-soon" aria-disabled="true" aria-label={`${label}: em breve`}>{label}<small>Em breve</small></span>)}</nav>;
  return <><header className={`m-header movie-site-header ${utilityNavigation?'movie-utility-header':''} ${overlay?'md-header':''}`}>
    {!utilityNavigation&&<Link href="/" className="logo" aria-label="Void — início">void<span><Icon name="dot"/></span></Link>}
    {!utilityNavigation&&<span className="m-header-divider" aria-hidden="true"/>}
    {!bar&&navigation}
    {back&&<Link className="movie-header-back" href={back.href}><Icon name="arrow-left"/> {back.label}</Link>}
  </header>{bar&&createPortal(navigation,bar)}</>;
}
