import GameCoverCard from './games/GameCoverCard';
import { useEffect, useState } from 'react';
import Icon from './Icon';
import { MovieFailure } from './movies/MovieUI';
import { releaseDay, validReleaseDate } from '../lib/movie-release';
import { useReleaseMarquee } from '../lib/use-release-marquee';

// One cover showcase for future releases and current trends: same card, rail,
// sizing, controls, motion preferences and mobile behavior.
export default function UpcomingGames({state, retry, library, mode='upcoming'}) {
  const trending=mode==='trending',title=trending?'Jogos em Alta':'Próximos lançamentos',headingId=trending?'game-trending':'game-upcoming';
  const [all, setAll] = useState(false), [day, setDay] = useState(() => releaseDay());
  const [message, setMessage] = useState('');
  const [more, setMore] = useState({games:[],page:1,hasNext:false,busy:false,error:''});
  const games = [...new Map([...(state?.games || []),...(!trending?more.games:[])].map(game=>[String(game.id),game])).values()].filter(game => trending&&state?.curated ? !!game.id : validReleaseDate(game.estreia) && (trending?game.estreia<=day:game.estreia>day));
  const marquee = useReleaseMarquee({ enabled: !all && !state?.loading && !state?.error && games.length > 0, count: games.length });
  async function loadMore(){
    setMore(old=>({...old,busy:true,error:''}));
    try{const response=await fetch(`/api/game-upcoming?page=${more.page+1}`);const data=await response.json();if(!response.ok)throw new Error(data.erro);setMore(old=>({...old,games:[...old.games,...data.games],page:old.page+1,hasNext:data.hasNext,busy:false}));}
    catch{setMore(old=>({...old,busy:false,error:'Não foi possível carregar mais jogos. Tente novamente.'}));}
  }
  useEffect(() => {const refresh=()=>setDay(releaseDay());const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};},[]);
  return <section className="game-releases m-container upcoming-showcase" aria-labelledby={headingId}>
    <div className="upcoming-heading"><h2 id={headingId}><Icon name={trending?'sparkle':'calendar'}/>{title}</h2><button type="button" className="upcoming-all" aria-expanded={all} onClick={()=>setAll(value=>!value)}>{all?'Voltar à vitrine':'Ver todos'} <Icon name={all?'arrow-left':'arrow-right'}/></button></div>
    {trending&&state?.basis&&<p className="upcoming-caption">{state.basis.criterion} {state.observedAt&&<>Dados de {new Date(state.observedAt).toLocaleDateString('pt-BR',{timeZone:'UTC'})}.</>} <a href={state.basis.source==='IGDB'?'https://www.igdb.com/':'https://rawg.io/'} target="_blank" rel="noreferrer">{state.basis.source==='IGDB'?'IGDB':'RAWG'}</a>{state.basis.source.includes('Steam')&&<> · <a href="https://store.steampowered.com/charts/mostplayed" target="_blank" rel="noreferrer">Steam Charts</a></>}</p>}
    {state?.notice&&<p className="upcoming-caption" role="status">{state.notice}</p>}
    {state?.loading?<div className="upcoming-skeleton" role="status" aria-label={`Carregando ${title.toLowerCase()}`}>{Array.from({length:7},(_,i)=><span className="m-skeleton" key={i}/>)}</div>:state?.error?<MovieFailure message={state.error} retry={retry}/>:!games.length?<p className="m-empty">{trending?'Nenhum jogo em alta verificado disponível nesta seleção.':'Nenhum lançamento futuro disponível nesta seleção.'}</p>:<>
    {all&&<p className="upcoming-caption">{trending?'Todos os jogos desta seleção':'Todos os próximos lançamentos desta seleção RAWG'} · {games.length} jogos</p>}
    <div className="upcoming-carousel">
      {!all&&<button className="upcoming-arrow upcoming-prev" aria-label={trending?'Jogos em alta anteriores':'Lançamentos anteriores'} onClick={()=>marquee.move(-1)}><Icon name="chevron-left"/></button>}
      <div ref={marquee.viewport} className={`upcoming-track ${all?'is-expanded':'is-marquee'}`} {...(!all ? marquee.events : {})} tabIndex={0} role="region" aria-label={trending?'Jogos em alta selecionados pelo VOID':'Jogos com lançamento futuro'}>
      <div className="upcoming-rail" ref={marquee.rail} style={all?undefined:{'--release-count':games.length}}>
      {(all?[0]:Array.from({length:Math.max(2,Math.ceil(8/games.length)+1)},(_,i)=>i)).map(copy=><div className="upcoming-group" key={copy} ref={copy===0?marquee.group:null} aria-hidden={copy>0?'true':undefined}>
      {games.map(item=>{const entry=library?.entries[String(item.id)];return <GameCoverCard item={item} key={item.id} tabIndex={copy>0?-1:undefined} badge={<span className="upcoming-badge">{trending?'EM ALTA':'EM BREVE'}</span>} footer={<>
{trending?<span>{item.ano||item.estreia?.slice(0,4)||'Data a confirmar'}</span>:<time dateTime={item.estreia}>{new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(item.estreia+'T12:00:00Z')).replaceAll(' de ',' ').replace('.','')}</time>}<button tabIndex={copy>0?-1:undefined} disabled={!library?.ready} aria-label={`${entry?'Já está na biblioteca':'Quero jogar'}: ${item.titulo}`} aria-pressed={!!entry} title={entry?'Já está na biblioteca':'Quero jogar'} onClick={()=>{if(entry){setMessage('Este jogo já está na sua biblioteca. Edite o status na página do jogo.');return;}if(library.update(item,'want'))setMessage(`${item.titulo} adicionado a Quero jogar.`);}}><Icon name={entry?'check':'plus'}/></button></>} />;})}</div>)}</div></div>
      {!all&&<button className="upcoming-arrow upcoming-next" aria-label={trending?'Mais jogos em alta':'Próximos jogos'} onClick={()=>marquee.move(1)}><Icon name="chevron-right"/></button>}
    </div></>}
    {!trending&&all&&(more.page===1?state?.hasNext:more.hasNext)&&<button type="button" className="upcoming-all" disabled={more.busy} onClick={loadMore}>{more.busy?'Carregando…':'Carregar mais lançamentos'} <Icon name="arrow-right"/></button>}
    {more.error&&<p role="alert">{more.error}</p>}
    <p className="upcoming-feedback" role="status">{library?.error||message}</p>
    <p className="upcoming-caption">Capas: <a href="https://store.steampowered.com/" target="_blank" rel="noreferrer">Steam</a> · <a href="https://www.igdb.com/" target="_blank" rel="noreferrer">IGDB</a></p>
  </section>;
}
