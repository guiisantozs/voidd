import {releaseDay,validReleaseDate} from './movie-release.js';
export const SERIES_DETAIL_RULES={recentEpisodeDays:14,providersCacheMs:6*3600000};
export function validSeriesCoordinates(id,season,episode=0){return /^[1-9]\d{0,9}$/.test(String(id))&&Number.isInteger(season)&&season>=0&&season<=1000&&Number.isInteger(episode)&&episode>=0&&episode<=10000;}
export function unitKey(unit){return `${unit.seasonNumber}:${unit.episodeNumber||0}`;}
export function unitReleased(unit,now=new Date()){return validReleaseDate(unit?.airDate)&&unit.airDate<=releaseDay(now);}
export function nextUnratedEpisode(episodes,reviews={},now=new Date()){
 const cutoff=releaseDay(new Date(now.getTime()-SERIES_DETAIL_RULES.recentEpisodeDays*86400000));
 return episodes.filter(Boolean).filter(episode=>unitReleased(episode,now)&&episode.airDate>=cutoff&&!reviews[unitKey(episode)]).sort((a,b)=>b.airDate.localeCompare(a.airDate)||b.seasonNumber-a.seasonNumber||b.episodeNumber-a.episodeNumber)[0]||null;
}
export function seasonPersonalAverage(reviews){const scores=Object.entries(reviews||{}).filter(([key])=>key.endsWith(':0')).map(([,row])=>row.nota);return scores.length?scores.reduce((sum,value)=>sum+value,0)/scores.length:null;}
