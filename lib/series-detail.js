import {seriesResource} from './series-catalog.js';
import {normalizeSeries,seriesAllowed} from './series-model.js';
import {trailerFrom} from './movie-detail.js';
import {SERIES_DETAIL_RULES,validSeriesCoordinates} from './series-units.js';
import {latestRecentEpisode} from './episode-releases.js';
import {decodeAnimeId} from './anime-provider.js';
export {SERIES_DETAIL_RULES,validSeriesCoordinates,unitKey,unitReleased,nextUnratedEpisode} from './series-units.js';
export const seriesStatus={ReturningSeries:'Em exibição','Returning Series':'Em exibição',Ended:'Finalizada',Canceled:'Cancelada','In Production':'Em produção',Planned:'Planejada',Pilot:'Piloto'};
const image=(path,size='w185')=>path?`https://image.tmdb.org/t/p/${size}${path}`:null;
export function normalizeEpisode(row,seriesId){return {id:row.id,seriesId:Number(seriesId),seasonNumber:row.season_number,episodeNumber:row.episode_number,episodeType:row.episode_type||null,name:row.name||`Episódio ${row.episode_number}`,airDate:row.air_date||null,runtime:row.runtime||null,overview:row.overview||'',still:image(row.still_path,'w300')};}
export function normalizeSeason(row,seriesId){return {id:row.id,seriesId:Number(seriesId),seasonNumber:row.season_number,episodeNumber:0,name:row.name||`Temporada ${row.season_number}`,airDate:row.air_date||null,episodeCount:row.episode_count??row.episodes?.length??0,poster:image(row.poster_path,'w185'),overview:row.overview||''};}
export function normalizeSeriesDetail(data){
 const people=rows=>(rows||[]).map(person=>({id:person.id,nome:person.name,papel:person.character||person.job||person.department||'',foto:image(person.profile_path)}));
 const status=seriesStatus[data.status]||data.status||'',last=data.last_episode_to_air,next=data.next_episode_to_air;
 return {...normalizeSeries(data),poster:image(data.poster_path,'w500'),isAnime:!seriesAllowed({...data,adult:false,poster_path:data.poster_path||'/placeholder'}),releaseStatus:data.status||'',statusLabel:status,tagline:data.tagline||'',originalTitle:data.original_name||'',numberOfEpisodes:data.number_of_episodes??null,
  classificacao:data.content_ratings?.results?.find(row=>row.iso_3166_1==='BR')?.rating||null,
  elenco:people(data.credits?.cast),creditos:people(data.credits?.cast).slice(0,8),equipe:people(data.credits?.crew),trailer:trailerFrom(data.videos?.results),
  galeria:(data.images?.backdrops||[]).slice(0,12).map(row=>({thumb:image(row.file_path,'w300'),src:image(row.file_path,'w1280')})),
  seasons:(data.seasons||[]).map(row=>normalizeSeason(row,data.id)).sort((a,b)=>Number(a.seasonNumber===0)-Number(b.seasonNumber===0)||a.seasonNumber-b.seasonNumber),
  lastEpisode:last?normalizeEpisode(last,data.id):null,nextEpisode:next?normalizeEpisode(next,data.id):null,
  yearRange:data.first_air_date?`${data.first_air_date.slice(0,4)}${data.status==='Ended'||data.status==='Canceled'?data.last_air_date&&data.last_air_date.slice(0,4)!==data.first_air_date.slice(0,4)?`–${data.last_air_date.slice(0,4)}`:'':'–atual'}`:'',
  informacoes:[{label:'Criação',valor:(data.created_by||[]).map(row=>row.name).join(', ')},{label:'Emissora / Rede',valor:(data.networks||[]).map(row=>row.name).join(', ')},{label:'País',valor:(data.production_countries||[]).map(row=>row.name).join(', ')},{label:'Idioma',valor:(data.spoken_languages||[]).map(row=>row.name||row.english_name).join(', ')},{label:'Estreia',valor:data.first_air_date},{label:'Último episódio exibido',valor:last?.air_date?`${last.name} · ${last.air_date}`:null},{label:'Próximo episódio',valor:next?.air_date?`${next.name} · ${next.air_date}`:null},{label:'Status',valor:status},{label:'Título original',valor:data.original_name},{label:'Temporadas',valor:data.number_of_seasons?String(data.number_of_seasons):null},{label:'Episódios',valor:data.number_of_episodes?String(data.number_of_episodes):null}].filter(row=>row.valor),fonte:'TMDB',fonteUrl:`https://www.themoviedb.org/tv/${data.id}`};
}
export async function getSeriesDetail(id,{fetcher}={}){
 if(!validSeriesCoordinates(id,0)||decodeAnimeId(id))throw Error('INVALID');
 const data=await seriesResource(`tv/${id}`,{append_to_response:'credits,videos,images,content_ratings,keywords',include_image_language:'pt,en,null'},fetcher);
 if(!trailerFrom(data.videos?.results)){try{data.videos=await seriesResource(`tv/${id}/videos`,{language:'en-US'},fetcher);}catch{/* Optional trailer does not block details. */}}
 return normalizeSeriesDetail(data);
}
export async function getSeriesSeason(id,season,{fetcher}={}){
 if(!validSeriesCoordinates(id,season))throw Error('INVALID');
 const data=await seriesResource(`tv/${id}/season/${season}`,{},fetcher);
 return {...normalizeSeason(data,id),episodes:(data.episodes||[]).map(row=>normalizeEpisode(row,id))};
}
export async function getSeriesProviders(id,region='BR',{fetcher}={}){
 if(!validSeriesCoordinates(id,0)||!/^[A-Z]{2}$/.test(region))throw Error('INVALID');
 const data=await seriesResource(`tv/${id}/watch/providers`,{},fetcher,SERIES_DETAIL_RULES.providersCacheMs),local=data.results?.[region]||{};
 const safeLink=typeof local.link==='string'&&/^https:\/\/www\.themoviedb\.org\//.test(local.link)?local.link:null;
 return {region,link:safeLink,groups:[['flatrate','Assinatura'],['rent','Aluguel'],['buy','Compra']].map(([key,label])=>({key,label,providers:[...new Map((local[key]||[]).map(row=>[row.provider_id,{id:row.provider_id,name:row.provider_name,logo:image(row.logo_path,'w92')}])).values()]})).filter(group=>group.providers.length)};
}
export async function getSeriesSimilar(id,page=1,{fetcher}={}){
 if(!validSeriesCoordinates(id,0)||!Number.isInteger(page)||page<1||page>500)throw Error('INVALID');
 const data=await seriesResource(`tv/${id}/similar`,{page},fetcher);
 return {movies:(data.results||[]).filter(seriesAllowed).map(normalizeSeries),page,totalPages:Math.min(data.total_pages||1,500)};
}
// The last aired episode shares the editorial metadata cache. Do not expand
// whole seasons or fetch trailers merely to render a recent-episode notice.
export async function getSeriesRecentEpisodes(id,{fetcher,now=new Date(),media='series'}={}){
 if(!validSeriesCoordinates(id,0)||!['series','animes'].includes(media))throw Error('INVALID');
 const row=await seriesResource(`tv/${id}`,{append_to_response:'keywords'},fetcher);
 if(row.id!==Number(id))throw Error('SOURCE');
 const isAnime=!seriesAllowed({...row,adult:false,poster_path:row.poster_path||'/placeholder'});
 if(row.adult||(media==='series'?isAnime:!isAnime))return {episodes:[]};
 const episode=latestRecentEpisode(row.last_episode_to_air?[normalizeEpisode(row.last_episode_to_air,Number(id))]:[],{now,media});
 return {episodes:episode?[episode]:[]};
}
