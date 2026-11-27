import {useState} from 'react';
import Head from 'next/head';
import Link from 'next/link';
import MovieHeader from '../../components/movies/MovieHeader';
import { GamesHeader } from '../../components/GameUI';
import {ShareReviewButton} from '../../components/review-share/ReviewShare';
import {shareImagePath} from '../../lib/review-share';
function ShareMetadata({review}){
 if(!review)return null;const url=review.origin+'/avaliacao/'+review.id,image=review.origin+shareImagePath(review.id,{format:'og'})+'&v='+encodeURIComponent(review.updatedAt),title=review.displayName+' avaliou '+review.title+' — Void',description=review.rating.toLocaleString('pt-BR',{minimumFractionDigits:1})+'/5'+(review.excerpt?' · '+review.excerpt:'');
 return <Head><title>{title}</title><meta name="description" content={description}/><link rel="canonical" href={url}/><meta property="og:type" content="article"/><meta property="og:site_name" content="Void"/><meta property="og:title" content={title}/><meta property="og:description" content={description}/><meta property="og:url" content={url}/><meta property="og:image" content={image}/><meta property="og:image:width" content="1200"/><meta property="og:image:height" content="630"/><meta property="og:image:alt" content={'Avaliação de '+review.title+' no Void'}/><meta name="twitter:card" content="summary_large_image"/><meta name="twitter:title" content={title}/><meta name="twitter:description" content={description}/><meta name="twitter:image" content={image}/></Head>;
}
function PublicCard({review}){const [state,setState]=useState('loading'),[attempt,setAttempt]=useState(0);return <div className="rs-public-image">{state==='error'?<div className="rs-error" role="alert"><p>Não foi possível carregar o card.</p><button type="button" onClick={()=>{setState('loading');setAttempt(n=>n+1);}}>Tentar novamente</button></div>:<>{state==='loading'&&<p role="status">Preparando o card…</p>}<img className="rs-public-card" src={shareImagePath(review.id)+'&v='+encodeURIComponent(review.updatedAt)+'-'+attempt} width="1080" height="1350" alt={'Card de '+review.title+', nota '+review.rating+' de 5'} onLoad={()=>setState('ready')} onError={()=>setState('error')}/></>}</div>;}
export default function PublicReview({review,unavailable=false}){
 const games=review?.media==='jogos';
 return <div className={games?"games-page games-home":"movies-page"}>{games?<GamesHeader/>:<MovieHeader current="avaliacoes"/>}<main className="rs-public">{unavailable?<><h1>A avaliação não está disponível agora</h1><p>Tente abrir este link novamente em alguns instantes.</p><Link href="/filmes">Explorar filmes</Link></>:<><Link href={games?"/jogos/avaliacoes":"/avaliacoes"}>Todas as avaliações</Link><div className="rs-public-grid"><PublicCard review={review}/><section><p className="rs-eyebrow">UMA MARCA NA COMUNIDADE VOID</p><h1>{review.title}</h1><p className="rs-public-author">{review.displayName}{review.username?' · @'+review.username:''}</p><p>{review.year} · {review.rating.toLocaleString('pt-BR',{minimumFractionDigits:1})}/5</p>{review.excerpt&&<p className="rs-public-copy">{review.excerpt}</p>}<div className="rs-public-links"><Link href={(games?'/obra/jogos/':'/filme/')+review.externalId}>{games?'Ver jogo no VOID':'Ver filme no Void'}</Link><ShareReviewButton id={review.id}/></div><p className="rs-muted">{games?`Dados: RAWG · Capa: ${review.coverSource||'indisponível'}`:'Dados e imagens: TMDB'}</p></section></div></>}</main></div>;
}
// Render head outside the account-loading gate so link crawlers receive real OG tags.
PublicReview.ShareMetadata=ShareMetadata;
export async function getServerSideProps({params,res}){
 res.setHeader('Cache-Control','private, no-store');
 const {loadShareReview}=await import('../../lib/review-share-server.js');
 try{const review=await loadShareReview(params.id,{publicOnly:true});return {props:{review}};}catch(error){if(['NOT_FOUND','INVALID'].includes(error.message))return {notFound:true};res.statusCode=error.message==='RATE_LIMIT'?429:503;res.setHeader('Retry-After','60');return {props:{unavailable:true,review:null}};}
}
