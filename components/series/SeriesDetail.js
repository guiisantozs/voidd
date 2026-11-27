import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/router';
import {useAccount} from '../AccountProvider';
import MovieDetail from '../movies/MovieDetail';
import MovieReviewForm from '../movies/MovieReviewForm';
import DetailModal from '../movies/DetailModal';
import SaveSeries from '../lists/SaveSeries';
import Icon from '../Icon';
import {MovieFailure} from '../movies/MovieUI';
import {readReviews,formatRating} from '../../lib/catalog';
import {DATA_EVENT} from '../../lib/account-storage';
import {useSeriesUnits} from '../../lib/use-series-units';
import {unitKey,unitReleased,seasonPersonalAverage} from '../../lib/series-units';
import {latestRecentEpisode,parseEpisodeReviewTarget} from '../../lib/episode-releases';
import SeriesSeasons,{dateLabel} from './SeriesSeasons';
import SeriesReviews from './SeriesReviews';
import WatchProviders from './WatchProviders';
import SeriesUniverses from './SeriesUniverses';
import {isJikanAnime} from '../../lib/anime-provider';
import {publicCatalog} from '../../lib/public-catalog-client';
import AnimeFranchise from '../animes/AnimeFranchise';
import AnimeReviews from '../animes/AnimeReviews';
import AnimeReviewModal from '../animes/AnimeReviewModal';
import AnimePeople,{AnimeCharacterPreview} from '../animes/AnimePeople';
import AnimeSeasons from '../animes/AnimeSeasons';
function Content(props){
 const {item}=props,media=item.categoria||'series',anime=media==='animes',{user}=useAccount(),units=useSeriesUnits(item,{enabled:!isJikanAnime(item)}),[modal,setModal]=useState(null),[revision,setRevision]=useState(0),[review,setReview]=useState(props.review),[reviewLevel,setReviewLevel]=useState('series');
 const [characters,setCharacters]=useState(item.characterPreview||[]);
 const router=useRouter(),loadSeason=useRef(units.loadSeason);loadSeason.current=units.loadSeason;
 const [linkError,setLinkError]=useState(''),[linkAttempt,setLinkAttempt]=useState(0);
 const target=parseEpisodeReviewTarget(router.query,item.id),targetKey=target?`${target.seasonNumber}:${target.episodeNumber}`:'';
 useEffect(()=>{
  if(!router.isReady||!targetKey)return;
  let active=true;setLinkError('');
  const [season,episode]=targetKey.split(':').map(Number);
  loadSeason.current(season,linkAttempt>0).then(async data=>{
   if(!active)return;
   let unit=data?.episodes.find(row=>row.seriesId===Number(item.id)&&row.seasonNumber===season&&row.episodeNumber===episode);
   if(!unit&&isJikanAnime(item)&&season===1)unit=await publicCatalog.request(`/api/series-detail?id=${item.id}&media=animes&part=episode&episode=${episode}`);
   if(!active)return;
   if(!unit||!unitReleased(unit)){setLinkError('Não foi possível confirmar um episódio lançado neste endereço.');return;}
   setModal({unit});
  }).catch(()=>{if(active)setLinkError('Não foi possível abrir a avaliação do episódio.');});
  return()=>{active=false;};
 },[router.isReady,targetKey,item.id,linkAttempt]);
 useEffect(()=>{const refresh=()=>{try{setReview(readReviews()[`${media}:${item.id}`]||null);}catch{/* The route displays its existing storage warning. */}};refresh();window.addEventListener(DATA_EVENT,refresh);return()=>window.removeEventListener(DATA_EVENT,refresh);},[item.id,user?.id]);
 const loadedEpisodes=Object.values(units.seasons).flatMap(state=>state.data?.episodes||[]),recent=latestRecentEpisode([item.lastEpisode,...units.recent,...loadedEpisodes]),recentReview=recent?units.reviews[unitKey(recent)]:null,average=seasonPersonalAverage(units.reviews);
 const openReview=(unit,work=item)=>setModal({unit:unit||null,work}),saved=()=>setRevision(value=>value+1);
 const extensions={media,revision,onReview:openReviews=>{setReviewLevel('series');openReviews();},saveAction:<SaveSeries item={item}/>,
  ...(isJikanAnime(item)?{castPreview:open=><AnimeCharacterPreview characters={characters} open={open}/>,renderCast:()=> <AnimePeople item={item} onCharacters={setCharacters}/>} :{}),
  metadata:<>{item.numberOfSeasons!=null&&<span>{item.numberOfSeasons} {item.numberOfSeasons===1?'temporada':'temporadas'}</span>}{item.numberOfEpisodes!=null&&<span>{item.numberOfEpisodes} episódios</span>}{item.statusLabel&&<span>{item.statusLabel}</span>}</>,
  details:anime?item.streaming?.length?<section><h3>Onde assistir</h3>{item.streaming.map(s=><p key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a></p>)}</section>:null:<WatchProviders id={item.id}/>,
  top:<>{recent&&<section className="sd-recent"><span className="sd-recent-icon"><Icon name={recentReview?'check':'play'}/></span><div><small>{recentReview?'EPISÓDIO AVALIADO':'NOVO EPISÓDIO'}</small><h2>{item.titulo}</h2><p>{item.sourceDefinedParts?'Produção':`Temporada ${recent.seasonNumber}`} · Episódio {String(recent.episodeNumber).padStart(2,'0')} · {dateLabel(recent.airDate)}</p><p>Exibição informada por {anime?'MyAnimeList':'TMDB'}; disponibilidade varia por região.</p></div><button className="md-primary" disabled={units.loading||units.error} onClick={()=>openReview(recent)}>{units.loading?'Consultando sua avaliação…':recentReview?'Ver ou editar avaliação':'Avaliar episódio'} <Icon name="arrow-up-right"/></button></section>}{linkError&&<MovieFailure message={linkError} retry={()=>setLinkAttempt(value=>value+1)}/>}</>,
  poster:<>{recent&&<button className="sd-new-episode" disabled={units.loading||units.error} onClick={()=>openReview(recent)}><Icon name="star"/> {recentReview?'Ver avaliação do episódio':'Avaliar novo episódio'}</button>}{average!=null&&<p className="sd-personal-average">Sua média {anime?'das partes':'das temporadas'}: <strong>{formatRating(average)}/5</strong><small>Independente da sua nota geral.</small></p>}</>,
  seasons:isJikanAnime(item)?<AnimeSeasons item={item} onReview={openReview}/>:<SeriesSeasons item={item} units={units} user={user} onReview={openReview}/>,
  renderReviews:summary=>isJikanAnime(item)?<AnimeReviews item={item} summary={summary} units={units} onReview={openReview} revision={revision}/>:<SeriesReviews level={reviewLevel} setLevel={setReviewLevel} item={item} summary={summary} units={units} onReview={openReview}/>,
  overview:anime?<AnimeFranchise item={item}/>:<SeriesUniverses id={item.id}/>};
 const unit=modal?.unit;
 return <><MovieDetail {...props} review={review} extensions={extensions}/>{modal&&(isJikanAnime(item)?<AnimeReviewModal work={modal.work||item} unit={unit} onClose={()=>setModal(null)} onSaved={saved}/>:<DetailModal title={unit?`${unit.episodeNumber?`${item.sourceDefinedParts?'Produção':`T${unit.seasonNumber}`} · E${unit.episodeNumber}`:unit.name} · ${item.titulo}`:`Avaliar ${anime?'anime':'série'} · ${item.titulo}`} onClose={()=>setModal(null)} trapFocus backdropClassName="sd-review-backdrop" headerContent={<div className="sd-modal-identity">{(unit?.poster||unit?.still||item.poster)&&<img src={unit?.poster||unit?.still||item.poster} alt="" width="52" height="78"/>}<div><p>{unit?`${unit.name} · ${item.titulo}`:item.titulo}</p><span>{unit?.airDate?.slice(0,4)||item.ano}</span></div></div>} className="sd-review-modal">
  {unit&&((units.loading&&units.highlightsAvailable===undefined)||units.error)?units.error?<MovieFailure message="Não foi possível conferir sua avaliação salva." retry={units.refresh}/>:<div className="md-review-skeleton m-skeleton" role="status" aria-label="Carregando sua avaliação"/>:<MovieReviewForm key={unit?unitKey(unit):`${media}:${item.id}`} movie={item} onSaved={saved} controller={unit?{key:`${media}:${item.id}:${unitKey(unit)}`,label:unit.episodeNumber?'episódio':item.sourceDefinedParts?'parte':'temporada',airDate:unit.airDate,allowed:unitReleased(unit),releaseMessage:`Disponível após a estreia confirmada: ${dateLabel(unit.airDate)}.`,record:units.reviews[unitKey(unit)]||null,highlightsAvailable:units.highlightsAvailable,save:(form,deleting)=>units.write(unit,deleting?'remove':'review',units.highlightsAvailable?form:(({highlights,...rest})=>rest)(form))}:undefined}/>}</DetailModal>)}</>;
}
export default function SeriesDetail(props){return props.item&&!props.loading&&!props.error?<Content key={props.item.id} {...props}/>:<MovieDetail {...props} extensions={{media:props.media||props.item?.categoria||'series'}}/>;}
