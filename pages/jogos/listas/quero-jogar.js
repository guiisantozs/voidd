import Head from 'next/head';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import Icon,{RatingStars} from '../../../components/Icon';
import {GamesHeader,GamesFooter,rememberGame} from '../../../components/GameUI';
import GameCover from '../../../components/GameCover';
import {useAccount} from '../../../components/AccountProvider';
import {ListCover,ListEmpty,ListError,ListSkeleton} from '../../../components/lists/ListUI';
import {useLibrary} from '../../../lib/use-library';
import {wantedGames,gameWishlist} from '../../../lib/game-wishlist';
import {workHref} from '../../../lib/work-client';
import {gameStatuses,gameStatusKey} from '../../../lib/library';
import {gameReviewHref} from '../../../lib/game-review-navigation';
import {DATA_EVENT,REVIEWS_KEY,scopedStorage} from '../../../lib/account-storage';
import {parseRating} from '../../../lib/ratings';
import {formatRating} from '../../../lib/catalog';

export default function WantToPlay(){
  const library=useLibrary(),{user}=useAccount();
  const [query,setQuery]=useState(''),[message,setMessage]=useState(''),[undo,setUndo]=useState(null);
  const [reviews,setReviews]=useState({});
  useEffect(()=>{
    function refresh(){try{setReviews(JSON.parse(scopedStorage(localStorage,user?.id||null).getItem(REVIEWS_KEY)||'{}'));}catch{setReviews({});}}
    refresh();window.addEventListener(DATA_EVENT,refresh);window.addEventListener('storage',refresh);window.addEventListener('focus',refresh);
    return()=>{window.removeEventListener(DATA_EVENT,refresh);window.removeEventListener('storage',refresh);window.removeEventListener('focus',refresh);};
  },[user?.id]);
  const games=wantedGames(library.entries),settings=gameWishlist(library.entries);
  const visible=games.filter(item=>item.titulo.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')));
  function update(item,status){if(status==='want')return;if(library.update(item,status)){setUndo({item,status});setMessage(status?`${item.titulo}: ${gameStatuses.find(option=>option.key===status)?.label}. O jogo saiu de Quero jogar e continua na biblioteca.`:`${item.titulo} removido de Quero jogar.`);}}
  function restore(){if(!undo)return;const current=library.entries[String(undo.item.id)];if(gameStatusKey(current)!==undo.status){setUndo(null);setMessage('O status deste jogo mudou. Sua escolha mais recente foi preservada.');return;}if(library.update(undo.item,'want')){setUndo(null);setMessage('Jogo restaurado em Quero jogar.');}}
  return <div className="movies-page games-shell lists-page game-lists-page"><Head><title>Quero jogar — VOID</title><meta name="robots" content="noindex"/></Head><GamesHeader/><main className="vl-container"><Link className="vl-back" href="/jogos/listas"><Icon name="arrow-left"/> Minhas listas de jogos</Link>
    <section className="vl-detail-hero"><ListCover items={settings.cover} title="Quero jogar" size="large"/><div><p className="vl-overline"><Icon name="gamepad"/> LISTA PADRÃO · PRIVADA · JOGOS</p><h1>Quero jogar</h1><p>{settings.description}</p><p className="vl-muted">{games.length} {games.length===1?'jogo':'jogos'} na sua próxima jornada.</p><div className="vl-detail-actions"><Link className="vl-button vl-primary" href="/jogos#game-search-title"><Icon name="plus"/> Encontrar jogos</Link></div><p className="vl-muted">{user?'Sua biblioteca sincronizada com a conta.':'Salva neste navegador. Entre para sincronizar entre dispositivos.'} Esta lista padrão não pode ser apagada.</p></div></section>
    <div className="vl-works-tools"><label className="game-wishlist-search">Buscar nesta lista<input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Qual será a próxima aventura?"/></label></div>
    <p className="vl-feedback" role="status">{message} {undo&&<button onClick={restore}>Desfazer</button>}</p>{library.error&&<ListError message={library.error}/>}
    <p className="vl-muted game-wishlist-hint">Ao escolher outro status, o jogo sai de Quero jogar e permanece na sua biblioteca.</p>
    {!library.ready?<ListSkeleton/>:!visible.length?<ListEmpty title={query?'Nenhum jogo encontrado':'Seu próximo jogo começa aqui'}>Use o + dos lançamentos ou escolha Quero jogar na página do jogo.</ListEmpty>:<ol className="vc-work-grid game-wishlist-grid">{visible.map(item=>{
      const score=parseRating(reviews[`jogos:${item.id}`]?.nota),reviewed=Number.isFinite(score);
      return <li key={item.id}><article className="vc-work-card"><Link className="vc-poster" href={workHref(item)} onClick={()=>rememberGame(item)} aria-label={`Ver ${item.titulo}`}><GameCover item={item}/></Link><div className="vc-work-body"><h3><Link href={workHref(item)} onClick={()=>rememberGame(item)}>{item.titulo}</Link></h3><small>{item.ano||'Data não informada'} · Jogo</small>
      <label className="game-wishlist-status"><span>Status do jogador<span className="sr-only">: {item.titulo}</span></span><select value={gameStatusKey(library.entries[String(item.id)])} onChange={event=>update(item,event.target.value)} disabled={!library.ready}>{gameStatuses.map(option=><option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
      <div className="vc-actions game-wishlist-actions"><Link className={reviewed?'game-wishlist-rating vl-button':'vl-button vl-primary'} href={gameReviewHref(item.id,reviewed)} onClick={()=>rememberGame(item)} aria-label={reviewed?`Editar avaliação de ${item.titulo}, nota ${formatRating(score)} de 5`:`Avaliar ${item.titulo}`}>{reviewed?<><RatingStars value={score}/><span>{formatRating(score)}</span><Icon name="edit"/></>:<><Icon name="edit"/> Avaliar</>}</Link><button type="button" onClick={()=>update(item,'')} aria-label={`Remover ${item.titulo} de Quero jogar`}><Icon name="minus"/> Remover</button></div>
      </div></article></li>;
    })}</ol>}

    </main><GamesFooter/></div>;
}
