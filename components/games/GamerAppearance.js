import {useMediaSearch} from '../../lib/use-media-search';
import MediaSearchPagination from '../MediaSearchPagination';
import {publicCatalog} from '../../lib/public-catalog-client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import Icon from '../Icon';
import DetailModal from '../movies/DetailModal';
import { useAccount } from '../AccountProvider';
import { ProfileAvatar } from '../profile/ProfileUI';
import { CollectionPortrait, GameLandscape } from './CollectionArtwork';
import { bannerSources,collectionAppearanceChoice,favoriteAsGame,favoriteGameHref,gamerArtOptions,gamerGameHref,playedGenrePills } from '../../lib/gamer-profile';
import { collectionHours } from '../../lib/game-collection';

export function GamerAppearancePicker({ field, value, games, onSave, onClose }) {
 const {ownProfile}=useAccount(),[source,setSource]=useState('own'),[query,setQuery]=useState(''),[choice,setChoice]=useState(value),[variant,setVariant]=useState(value?.variant||'hero'),[position,setPosition]=useState({x:value?.x??50,y:value?.y??40}),[issue,setIssue]=useState(''),[busy,setBusy]=useState(false);
 const input=useRef(null),saving=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const search=useMediaSearch({media:'jogos',query,enabled:source==='catalog'&&query.trim().length>=2}),{results}=search;

 const choiceKey=choice?choice.source+':'+choice.id:'';
 useEffect(()=>{
  if(!choice?.rawg_id&&!choice?.catalog_id)return;const controller=new AbortController();
  publicCatalog.request('/api/gamer-profile-media?'+new URLSearchParams({id:String(choice.catalog_id||choice.rawg_id)}),{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setChoice(old=>old&&old.source+':'+old.id===choiceKey?{...data.item,...old,rawg_background:data.item.rawg_background,rawg_additional:data.item.rawg_additional,genres:data.item.genres,steam_appid:old.steam_appid||data.item.steam_appid}:old);}).catch(()=>{if(!controller.signal.aborted)setIssue('Algumas artes do catálogo estão indisponíveis. As imagens já disponíveis continuam abaixo.');});
  return()=>controller.abort();
 },[choiceKey]);
 const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const own=games.filter(game=>normalize(game.title).includes(normalize(query))).map(collectionAppearanceChoice);
 const found=source==='own'?own:(results.items||[]).map(item=>({source:item.id>=9000000000?'catalog':'rawg',id:String(item.id),rawg_id:item.id>=9000000000?null:item.id,...(item.id>=9000000000?{catalog_id:item.id}:{}),officialCover:item.officialCover,title:item.titulo,cover_url:item.poster,rawg_background:item.poster?.includes('media.rawg.io/')?item.poster:null}));
 const options=choice?gamerArtOptions(choice):[];
 const selected=options.find(art=>art.variant===variant)||options[0];
 const fallback=[...games].sort((a,b)=>(b.minutes??-1)-(a.minutes??-1))[0];
 async function save(remove=false){if(saving.current)return;saving.current=true;setBusy(true);setIssue('');try{await onSave(field,remove?null:{source:choice.source,id:choice.id,variant:selected?.variant,x:position.x,y:position.y});if(mounted.current)onClose();}catch(error){if(mounted.current)setIssue(error.message||'Não foi possível salvar sua escolha.');}finally{saving.current=false;if(mounted.current)setBusy(false);}}
 function select(item){setChoice(item);setIssue('');setVariant(item.source==='collection'&&item.steam_appid?'hero':'rawg');setPosition({x:50,y:40});}
 const preview=field==='banner'?choice&&selected?{...choice,url:selected.url,...position}:null:null;
 const close=()=>{if(!saving.current)onClose();};
 return createPortal(<DetailModal title={field==='banner'?'Escolher banner':'Escolher jogo favorito'} className="cp-appearance-modal" backdropClassName="cp-appearance-backdrop" initialFocusRef={input} inertBackground onClose={close}>
  <div className="cp-appearance-body"><div className="cp-picker-tabs" role="group" aria-label="Origem dos jogos"><button type="button" aria-pressed={source==='own'} onClick={()=>setSource('own')}>Meus jogos <span>{games.length}</span></button><button type="button" aria-pressed={source==='catalog'} onClick={()=>setSource('catalog')}>Buscar no catálogo</button></div><label className="cp-picker-search"><Icon name="search"/><span className="sr-only">Pesquisar jogos pelo nome</span><input ref={input} type="search" maxLength={80} placeholder={source==='own'?'Pesquisar na sua coleção…':'Digite o nome do jogo…'} value={query} onChange={event=>setQuery(event.target.value)}/></label>
  <section className="cp-appearance-preview" aria-label={field==='banner'?'Pré-visualização do banner':'Pré-visualização do favorito'}>{field==='banner'?<><div className={`cp-picker-banner ${preview?'is-custom':''}`}><GameLandscape game={choice||fallback} sources={bannerSources(preview,fallback)} style={{'--gamer-x':`${position.x}%`,'--gamer-y':`${position.y}%`}}/><div className="cp-picker-banner-shade"/><span>PRÉVIA DO PERFIL GAMER</span></div><div className="cp-picker-preview-identity"><ProfileAvatar profile={ownProfile||{}}/><strong>{ownProfile?.display_name||'Seu perfil gamer'}</strong><small>{choice?.title||'Banner padrão do jogo mais jogado'}</small></div></>:choice?<div className="cp-picker-favorite-preview"><CollectionPortrait game={favoriteAsGame(choice)}/><div><small>JOGO FAVORITO</small><h3>{choice.title}</h3><p>Sua escolha aparece no seu perfil gamer.</p></div></div>:<p>Escolha o jogo que mais combina com você.</p>}</section>
  {field==='banner'&&choice&&<><div className="cp-picker-art-options" role="group" aria-label="Artes disponíveis">{options.map(art=><button type="button" key={art.variant} aria-pressed={selected?.variant===art.variant} onClick={()=>setVariant(art.variant)}><img src={art.url} alt={art.label} loading="lazy" onError={event=>{event.currentTarget.style.visibility='hidden';}}/><span>{art.label}</span></button>)}</div><label className="cp-picker-position">Enquadramento vertical <input type="range" min="0" max="100" value={position.y} onChange={event=>setPosition(old=>({...old,y:Number(event.target.value)}))}/></label></>}
  {issue&&<p className="cp-picker-feedback" role="alert">{issue}</p>}{source==='catalog'&&results.notice&&<p className="cp-picker-feedback" role="status">{results.notice}</p>}
  <div className="cp-picker-results-heading"><h3>{source==='own'?'Da sua coleção':'Resultados da busca'}</h3><span>{found.length} jogos</span></div>{results.loading&&source==='catalog'?<p role="status">Buscando jogos no cat?logo…</p>:results.error&&source==='catalog'?<p role="alert">{results.error}</p>:<div className="cp-picker-results">{found.map(item=><button type="button" key={item.source+item.id} aria-pressed={choiceKey===item.source+':'+item.id} onClick={()=>select(item)}><CollectionPortrait game={favoriteAsGame(item)} decorative/><span>{item.title}</span></button>)}</div>}{source==='catalog'&&<MediaSearchPagination search={search}/>} {!found.length&&!results.loading&&<p className="cp-picker-feedback">{source==='catalog'&&query.trim().length<2?'Digite pelo menos dois caracteres para pesquisar.':'Nenhum jogo encontrado nesta seleção.'}</p>}<p className="cp-picker-attribution">Catálogo e artes: RAWG · Steam</p></div>
  <footer className="cp-appearance-footer"><button type="button" className="cp-primary" disabled={busy||!choice||(field==='banner'&&!selected)} onClick={()=>save(false)}>{busy?'Salvando…':'Salvar'}</button><button type="button" disabled={busy||!value} onClick={()=>save(true)}>{field==='banner'?'Remover banner':'Remover favorito'}</button><button type="button" disabled={busy} onClick={close}>Cancelar</button></footer>
 </DetailModal>,document.body);
}

export function GamerShareButton({ data }) {
 const [message,setMessage]=useState(''),[link,setLink]=useState('');
 async function share(){
  if(data.visibility!=='public'||data.profile?.visibility!=='public'){setMessage('Para compartilhar publicamente, deixe sua coleção e seu perfil públicos.');setLink('');return;}
  const url=new URL('/jogos/colecao',window.location.origin);url.searchParams.set('perfil',data.profile.user_id);setLink(url.href);
  try{await navigator.clipboard.writeText(url.href);setMessage('Link do perfil gamer copiado!');}catch{setMessage('Copie o link do seu perfil gamer abaixo.');}
 }
 return <div className="cp-share-control"><button type="button" className="cp-share-profile" onClick={share} aria-label="Compartilhar perfil" title="Compartilhar perfil"><Icon name="arrow-up-right"/><span>Compartilhar perfil</span></button>{message&&<div className="cp-share-message"><p role="status">{message}</p>{link&&<input aria-label="Link do perfil gamer" readOnly value={link} onFocus={event=>event.target.select()}/>}<button type="button" onClick={()=>{setMessage('');setLink('');}} aria-label="Fechar mensagem de compartilhamento"><Icon name="close"/></button></div>}</div>;
}

export function GamerPublicAppearance({ data }) {
 const banner=data.appearance?.banner,favorite=data.appearance?.favorite;
 if(!banner&&!favorite)return null;
 return <div className="cp-public-appearance">{banner&&<div className="cp-public-gamer-banner"><GameLandscape game={{title:banner.title}} sources={bannerSources(banner)} style={{'--gamer-x':`${banner.x??50}%`,'--gamer-y':`${banner.y??40}%`}}/><span>PERFIL GAMER</span></div>}{favorite&&<Link className="cp-public-favorite" href={favoriteGameHref(favorite,data.owner?null:data.profile?.user_id)}><CollectionPortrait game={favoriteAsGame(favorite)}/><div><small>JOGO FAVORITO</small><strong>{favorite.title}</strong></div><Icon name="heart"/></Link>}<GamerShareButton data={data}/></div>;
}

export function PlayedGenrePills({ games, metadata, loading }) {
 const pills=playedGenrePills(games,metadata);
 return <section className="cp-played-genres"><h3>Gêneros mais jogados</h3>{pills.length?<><div>{pills.map(genre=><span key={genre.name} title={`${genre.games} jogos · ${collectionHours(genre.minutes)} registradas`}>{genre.name}</span>)}</div><small>Entre os jogos com gênero disponível no catálogo.</small></>:<p>{loading?'Carregando gêneros…':'Gêneros indisponíveis para os jogos identificados.'}</p>}</section>;
}

export function TopPlayedPanel({ games, target }) {
 const top=[...games].sort((a,b)=>(b.minutes??-1)-(a.minutes??-1)).slice(0,3);
 return <section className="cp-top-three"><div className="cp-section-heading"><div><p>OS UNIVERSOS QUE FICARAM</p><h2>Top 3 mais jogados</h2></div><Icon name="clock"/></div><div>{top.map((game,index)=><Link key={game.id} href={gamerGameHref(game,target)}><span className="cp-top-three-rank">0{index+1}</span><CollectionPortrait game={game}/><strong>{game.title}</strong><span>{collectionHours(game.minutes)}</span></Link>)}</div>{!top.length&&<p>Seus jogos mais jogados aparecerão aqui.</p>}</section>;
}
