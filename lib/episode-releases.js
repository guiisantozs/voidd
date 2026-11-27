import {releaseDay,validReleaseDate} from './movie-release.js';

export const EPISODE_RELEASE_RULES={primaryDays:7,fallbackDays:14,target:12};
let dayInstant,dayValue;
function calendarDay(now) {const instant=now.getTime();if(instant!==dayInstant){dayValue=releaseDay(now);dayInstant=instant;}return dayValue;}
export function episodeIdentity(media,episode) {
  if(!['series','animes'].includes(media)||!Number.isSafeInteger(episode?.seriesId)||episode.seriesId<=0||!Number.isInteger(episode.seasonNumber)||episode.seasonNumber<1||episode.seasonNumber>1000||!Number.isInteger(episode.episodeNumber)||episode.episodeNumber<1||episode.episodeNumber>10000)return null;
  return `${media}:${episode.seriesId}:${episode.seasonNumber}:${episode.episodeNumber}`;
}
// TMDB supplies a calendar date, not a worldwide release instant. Without a
// verified timestamp, do not announce today's episode as already available.
export function episodeAlreadyAired(episode,now=new Date()) {
  if(!validReleaseDate(episode?.airDate))return false;
  const today=calendarDay(now);
  if(episode.airDate>today)return false;
  if(episode.airDate<today)return true;
  return typeof episode.airDateTime==='string'&&/(?:Z|[+-]\d{2}:\d{2})$/.test(episode.airDateTime)&&Number.isFinite(Date.parse(episode.airDateTime))&&Date.parse(episode.airDateTime)<=now.getTime();
}
export function recentEpisode(episode,{now=new Date(),days=EPISODE_RELEASE_RULES.fallbackDays,media='series'}={}) {
  if(!episodeIdentity(media,episode)||!episodeAlreadyAired(episode,now))return false;
  if(episode.promotional||episode.isSpecial||['special','trailer','teaser','promo','promotional'].includes(episode.episodeType)||/^(?:trailer|teaser|promo(?:tional)?|prévia|preview)(?:\b|:)/i.test(episode.name||''))return false;
  const age=(Date.parse(calendarDay(now))-Date.parse(episode.airDate))/86400000;
  return age>=0&&age<=days;
}
export function latestRecentEpisode(episodes,options) {
  return episodes.filter(episode=>recentEpisode(episode,options)).sort((a,b)=>b.airDate.localeCompare(a.airDate)||b.seasonNumber-a.seasonNumber||b.episodeNumber-a.episodeNumber)[0]||null;
}
export function selectEpisodeHighlights(candidates,{now=new Date(),media='series',target=EPISODE_RELEASE_RULES.target}={}) {
  const unique=new Map();
  for(const candidate of candidates) {
    const episode=candidate.episode;
    if(!recentEpisode(episode,{now,media})||String(candidate.series?.id)!==String(episode.seriesId))continue;
    const previous=unique.get(String(episode.seriesId));
    if(!previous||latestRecentEpisode([previous.episode,episode],{now,media})===episode)unique.set(String(episode.seriesId),candidate);
  }
  const rows=[...unique.values()],primary=rows.filter(row=>recentEpisode(row.episode,{now,media,days:EPISODE_RELEASE_RULES.primaryDays}));
  const windowDays=primary.length>=target?EPISODE_RELEASE_RULES.primaryDays:EPISODE_RELEASE_RULES.fallbackDays;
  return {episodes:(windowDays===7?primary:rows).sort((a,b)=>Number(recentEpisode(b.episode,{now,media,days:7}))-Number(recentEpisode(a.episode,{now,media,days:7}))||b.episode.airDate.localeCompare(a.episode.airDate)||(b.relevance||0)-(a.relevance||0)||Number(a.series.id)-Number(b.series.id)).slice(0,target),windowDays};
}
export function episodeReviewHref(media,episode) {
  return episodeIdentity(media,episode)?`/obra/${media}/${episode.seriesId}?season=${episode.seasonNumber}&episode=${episode.episodeNumber}&review=episode`:null;
}
export function parseEpisodeReviewTarget(query,seriesId) {
  if(query?.review!=='episode'||typeof query.season!=='string'||typeof query.episode!=='string'||! /^[1-9]\d{0,3}$/.test(query.season)||! /^[1-9]\d{0,4}$/.test(query.episode))return null;
  const unit={seriesId:Number(seriesId),seasonNumber:Number(query.season),episodeNumber:Number(query.episode)};
  return episodeIdentity('series',unit)?unit:null;
}
export function episodeReleaseLabel(date,now=new Date()) {
  if(!validReleaseDate(date))return 'Data a confirmar';
  const days=Math.round((Date.parse(calendarDay(now))-Date.parse(date))/86400000);
  return days===0?'Hoje':days===1?'Ontem':days>1?`Há ${days} dias`:new Date(date+'T12:00:00Z').toLocaleDateString('pt-BR');
}
