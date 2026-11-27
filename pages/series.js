import LazyCatalogSection from '../components/movies/LazyCatalogSection';
import Head from 'next/head';
import MovieHeader from '../components/movies/MovieHeader';
import {MovieListProvider} from '../components/movies/MovieUI';
import Link from 'next/link';
import {useEffect} from 'react';
import MovieHero from '../components/movies/MovieHero';
import MovieSearch from '../components/movies/MovieSearch';
import CatalogNowPlaying from '../components/movies/CatalogNowPlaying';
import WeeklyFeature from '../components/movies/WeeklyFeature';
import PosterRow from '../components/movies/PosterRow';
import FriendMovieCard,{FriendPosterSkeletons} from '../components/movies/FriendMovieCard';
import CatalogFooter from '../components/movies/CatalogFooter';
import {useCatalogSections} from '../lib/use-movie-catalog';
import {useSeriesCommunity} from '../lib/use-series-community';
import {useVisibleSection} from '../lib/use-visible-section';
import {adjacentSeries} from '../lib/series-model';
import EpisodeHighlights from '../components/series/EpisodeHighlights';
import {SERIES_RULES,seriesGenres,essentialSeriesIds} from '../config/series';
import {useAccount} from '../components/AccountProvider';
import UniverseShortcuts from '../components/universes/UniverseShortcuts';
import SeriesPreferences from '../components/series/SeriesPreferences';
import {useSeriesPersonalization} from '../lib/use-series-personalization';
import {seriesUniverses} from '../config/series-universes';
import {animeDiscoveryNote} from '../config/anime-discovery';
import {animeGenres,animeUniverses} from '../config/animes';
import {adjacentAnime} from '../lib/anime-provider';
function GenreRow({genre,state,previous,load,media='series'}){
 const adjacent=media==='animes'?adjacentAnime:adjacentSeries;
 const [ref,visible]=useVisibleSection();
 useEffect(()=>{if(visible&&!state)load(genre.key);},[visible,!!state,load,genre.key]);
 return <div ref={ref} className="series-lazy-row"><PosterRow media={media} sectionKey={genre.key} title={genre.title} icon={genre.icon} state={state?{...state,movies:adjacent(state.movies,previous)}:undefined} retry={()=>load(genre.key)} href={`/${media}/explorar?section=${genre.key}`}/></div>;
}
export function SeriesCatalog({media='series'}){
 const anime=media==='animes',genres=anime?animeGenres:seriesGenres,universes=anime?animeUniverses:seriesUniverses,adjacent=anime?adjacentAnime:adjacentSeries;
 const [socialRef,socialVisible]=useVisibleSection();
 const {sections,load}=useCatalogSections({basePath:`/api/${media}`,initial:['editorial']}),social=useSeriesCommunity({includeRecommendations:false,enabled:socialVisible,media}),{user}=useAccount(),taste=useSeriesPersonalization(media);
 const edition=sections.editorial,editorialState=key=>edition?{...edition,movies:edition[key]||[]}:undefined;
 const activity=social.sections.community,hero=editorialState('hero'),trends=editorialState('trending'),weekly=editorialState('weekly'),rows={};let previous=hero?.movies||[];
 for(const [key,state] of [['trending',trends],['community',activity],['friends',social.sections.friends],['recommended',taste.recommendations||{movies:[],loading:taste.loading}],['acclaimed',sections.acclaimed],['essentials',sections.essentials],['upcoming',sections.upcoming]]){
  let candidates=key==='acclaimed'&&!anime?state?.movies?.filter(item=>!essentialSeriesIds.includes(Number(item.id))):state?.movies;
  let movies=(['trending','community'].includes(key)?candidates:adjacent(candidates,key==='essentials'?[]:previous))||[];
  if(['friends','recommended'].includes(key)&&!movies.length)movies=adjacent(candidates,[]);
  rows[key]=state?{...state,movies}:undefined;if(movies.length)previous=movies;
 }
 const genrePrevious={};for(const genre of genres){genrePrevious[genre.key]=previous;const current=adjacent(sections[genre.key]?.movies,previous);if(current.length)previous=current;}
 return <div className={`movies-page movies-home series-home${anime?' anime-home':''}`}><Head><title>{anime?'Animes':'Séries'} — VOID</title><meta name="description" content="Séries em alta, recomendações para você e descobertas da comunidade. Explore suas próximas histórias no Void."/></Head><MovieHeader home current={media} media={media} seriesOnly/>
  <main><MovieHero media={media} state={hero} retry={()=>load('editorial')}/>
   <MovieSearch media={media}/><LazyCatalogSection section="new-seasons" state={sections["new-seasons"]} load={load}><CatalogNowPlaying media={media} state={sections['new-seasons']} load={load}/></LazyCatalogSection><WeeklyFeature media={media} state={weekly} retry={()=>load('editorial')}/><div ref={socialRef} className="m-container m-rows">
    <PosterRow media={media} sectionKey="trending" title={anime?'Animes em alta':'Séries em alta'} icon="arrow-up-right" state={rows.trending} retry={()=>load('editorial')} href={`/${media}/explorar?section=trending`} intro={<p className="series-row-note">{anime?(edition?.discoveryNote||animeDiscoveryNote):'Tendências mundiais e interesse recente no TMDB. Não é um ranking de audiência.'}</p>}/>
    <EpisodeHighlights media={media} endpoint={`/api/${media}/new-episodes`}/>
    <PosterRow media={media} sectionKey="community" title="Em alta no Void" icon="sparkle" state={rows.community} retry={()=>social.load('community')} intro={<p className="series-row-note">Avaliações públicas dos últimos sete dias, por volume e atividade recente no Void.{activity?.limited&&' Ranking da amostra disponível.'}</p>} empty={<p className="m-empty">A comunidade ainda não publicou avaliações recentes suficientes para esta seleção. As próximas descobertas podem começar com você.</p>}/>
    {(rows.friends?.loading||rows.friends?.error||rows.friends?.movies?.length>0)&&<PosterRow media={media} sectionKey="friends" title="O que seus amigos avaliaram" icon="users" state={rows.friends} retry={()=>social.load('friends')} className="friend-movie-section" renderCard={movie=><FriendMovieCard key={movie.id} movie={movie}/>} skeleton={<FriendPosterSkeletons/>}/>}
    <PosterRow media={media} sectionKey="recommended" title={anime?'Recomendados para você':'Recomendadas para você'} icon="heart" state={rows.recommended} retry={taste.retry} intro={<div className="series-taste-intro"><p>Histórias que combinam com seu universo.</p>{user&&<button type="button" onClick={taste.edit} disabled={taste.loading}>{taste.preferences?'Editar preferências':'Escolher minhas favoritas'}</button>}{!taste.open&&taste.saveError&&<p role="alert">{taste.saveError}</p>}</div>} empty={<p className="m-empty">{user? taste.preferences?'Não encontramos sugestões disponíveis agora. Tente novamente ou ajuste suas preferências.':'Escolha três obras de que você gosta para descobrir novas histórias.':'Entre no Void para receber recomendações com base nas suas obras favoritas.'} {!user&&<Link href="/conta">Entrar</Link>}{user&&taste.preferences&&<button type="button" onClick={taste.retry}>Tentar novamente</button>}</p>}/>
    <LazyCatalogSection section="acclaimed" state={sections["acclaimed"]} load={load}><PosterRow media={media} sectionKey="acclaimed" title={anime?'Aclamados pelo público':'Aclamadas pela crítica'} icon="star" state={rows.acclaimed} retry={()=>load('acclaimed')} href={`/${media}/explorar?section=acclaimed`} intro={<p className="series-row-note">{anime?'Maiores notas do público no MyAnimeList, conforme o ranking do provedor.':<>Seleção por notas do público no TMDB: pelo menos {SERIES_RULES.acclaimed.rating/2}/5 e {SERIES_RULES.acclaimed.minVotes.toLocaleString('pt-BR')} votos. Não são notas de veículos de crítica.</>}</p>}/></LazyCatalogSection>
    <LazyCatalogSection section="essentials" state={sections["essentials"]} load={load}><PosterRow media={media} sectionKey="essentials" title="Todos precisam assistir" icon="diamond" state={rows.essentials} retry={()=>load('essentials')} href={`/${media}/explorar?section=essentials`} intro={<p className="series-row-note">{anime?'Os títulos mais presentes nas listas do MyAnimeList. Popularidade externa, independente das avaliações no Void.':'Clássicos e fenômenos modernos em uma seleção editorial, com reconhecimento e avaliações do público no TMDB.'}</p>}/></LazyCatalogSection>
    {anime&&<LazyCatalogSection section="upcoming" state={sections.upcoming} load={load}><PosterRow media={media} sectionKey="upcoming" title="Próximos lançamentos" icon="calendar" state={rows.upcoming} retry={()=>load('upcoming')} href="/animes/explorar?section=upcoming" upcoming intro={<p className="series-row-note">Produções anunciadas que ainda não estrearam. Datas podem mudar.</p>}/></LazyCatalogSection>}
   </div><UniverseShortcuts items={universes} basePath={`/${media}/universos`} media={media}/>
   <div className="m-container m-rows series-genre-rows">{genres.map(genre=><GenreRow media={media} key={genre.key} genre={genre} state={sections[genre.key]} previous={genrePrevious[genre.key]} load={load}/>)}</div>
  </main><CatalogFooter media={media}/>{taste.open&&user&&<SeriesPreferences media={media} items={taste.items||[]} editing={!!taste.preferences} onClose={taste.close} onSave={taste.save} busy={taste.saving} error={taste.saveError}/>}
 </div>;
}
export default function Series(){return <MovieListProvider><SeriesCatalog/></MovieListProvider>;}
