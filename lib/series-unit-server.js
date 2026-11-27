import {validSeriesHighlights,missingHighlightsColumn} from './series-review-highlights.js';
import {parseRating} from './ratings.js';
import {cleanReviewText,validReview} from './review-detail.js';
import {getSeriesDetail,getSeriesSeason,validSeriesCoordinates,unitReleased} from './series-detail.js';
import {decodeAnimeId} from './anime-provider.js';
import {getAnimeDetail,getAnimeEpisode} from './anime-catalog.js';
import {animeEpisodes} from './anime-episodes.js';
export async function writeAnimeEpisodeBatch({reader,admin,owner,body,episodes=animeEpisodes}){
 const {seriesId,episodeNumbers,media}=body||{};
 if(!owner||media!=='animes'||!decodeAnimeId(seriesId)||!Array.isArray(episodeNumbers)||!episodeNumbers.length||episodeNumbers.length>25||episodeNumbers.some(n=>!Number.isInteger(n)||n<1||n>10000)||new Set(episodeNumbers).size!==episodeNumbers.length)throw Error('INVALID');
 const pages=[...new Set(episodeNumbers.map(n=>Math.ceil(n/25)))];if(pages.length>2)throw Error('INVALID');
 const loaded=(await Promise.all(pages.map(page=>episodes(seriesId,page)))).flatMap(row=>row.episodes),byNumber=new Map(loaded.map(row=>[row.episodeNumber,row]));
 const rows=episodeNumbers.map(n=>byNumber.get(n));if(rows.some(row=>!row||row.seriesId!==Number(seriesId)||!unitReleased(row)))throw Error('UNRELEASED');
 const {error:catalogError}=await admin.from('void_series_units').upsert(rows.map(row=>({series_id:Number(seriesId),season_number:1,episode_number:row.episodeNumber,name:row.name.slice(0,300),air_date:row.airDate,checked_at:new Date().toISOString()})));if(catalogError)throw catalogError;
 const {error}=await reader.from('void_series_episode_progress').upsert(rows.map(row=>({user_id:owner,series_id:Number(seriesId),season_number:1,episode_number:row.episodeNumber})),{onConflict:'user_id,series_id,season_number,episode_number'});if(error)throw error;return {saved:true,count:rows.length};
}
export async function writeSeriesUnit({reader,admin,owner,body,detail=getSeriesDetail,season=getSeriesSeason}){
 const {operation,seriesId,seasonNumber,episodeNumber=0,media='series'}=body||{};
 if(!['series','animes'].includes(media)||!['review','remove','watch','unwatch'].includes(operation)||!validSeriesCoordinates(seriesId,seasonNumber,episodeNumber)||!owner)throw Error('INVALID');
 const jikan=!!decodeAnimeId(seriesId);
 if(jikan&&(media!=='animes'||seasonNumber!==1))throw Error('INVALID');
 const target={user_id:owner,series_id:Number(seriesId),season_number:seasonNumber,episode_number:episodeNumber},table=['watch','unwatch'].includes(operation)?'void_series_episode_progress':'void_series_unit_reviews';
 if(table==='void_series_episode_progress'&&!episodeNumber)throw Error('INVALID');
 if(['remove','unwatch'].includes(operation)){
  let query=reader.from(table).delete();for(const [key,value] of Object.entries(target))query=query.eq(key,value);const {error}=await query;if(error)throw error;return {removed:true};
 }
 // New anime units use a reserved ID range. Dates come from each episode,
 // never from the premiere of the whole production.
 const show=await (jikan?getAnimeDetail:detail)(String(seriesId));if(media==='series'?show.isAnime:!show.isAnime)throw Error('INVALID');
 if(jikan&&!show.seasons?.some(row=>row.seasonNumber===seasonNumber))throw Error('INVALID');
 const data=jikan?show.seasons[0]:await season(String(seriesId),seasonNumber);
 const unit=jikan&&episodeNumber?await getAnimeEpisode(String(seriesId),episodeNumber):episodeNumber?data.episodes.find(row=>row.episodeNumber===episodeNumber):data;
 if(!unit||unit.seriesId!==Number(seriesId)||unit.seasonNumber!==seasonNumber||(unit.episodeNumber||0)!==episodeNumber||!unitReleased(unit))throw Error('UNRELEASED');
 const {error:catalogError}=await admin.from('void_series_units').upsert({series_id:Number(seriesId),season_number:seasonNumber,episode_number:episodeNumber,name:unit.name.slice(0,300),air_date:unit.airDate,checked_at:new Date().toISOString()});if(catalogError)throw catalogError;
 let record=target;
 if(operation==='review'){
  const form=body.form;if(!form||!validReview(form)||form.date<unit.airDate||typeof form.public!=='boolean'||typeof form.spoiler!=='boolean')throw Error('INVALID');
  if(form.highlights!==undefined&&!validSeriesHighlights(form.highlights))throw Error('INVALID');
  record={...target,...(form.highlights!==undefined?{highlights:form.highlights}:{}),rating:parseRating(form.rating),text:cleanReviewText(form.text),spoiler:form.spoiler,is_public:form.public,watched_on:form.date};
 }
 const {error}=await reader.from(table).upsert(record,{onConflict:'user_id,series_id,season_number,episode_number'});if(error){if(missingHighlightsColumn(error))throw Error('Os destaques ainda não estão disponíveis. Reabra a avaliação para salvar sua nota e review.');throw error;}return {saved:true};
}
