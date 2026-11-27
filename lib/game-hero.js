import {parseRating} from './ratings.js';
import {releaseDay,validReleaseDate} from './movie-release.js';
import {reviewIsPublic,validReview} from './review-detail.js';

export function gameTrailer(movies=[]) {
  for(const movie of movies){
    try{const url=new URL(movie.data?.['480']||movie.data?.max);if(url.protocol==='https:'&&(url.hostname==='rawg.io'||url.hostname.endsWith('.rawg.io'))&&/\.mp4$/i.test(url.pathname)){let thumbnail=null;try{const image=new URL(movie.preview);if(image.protocol==='https:'&&image.hostname==='media.rawg.io')thumbnail=image.href;}catch{}return {url:url.href,title:movie.name||'Trailer',thumbnail};}}catch{}
  }
  return null;
}
export function gameHeroImages(item){return [...new Set([item.backdrop||item.poster,...(item.screenshots||[])].filter(Boolean))];}
export function gameImageSource(source,width=1920){
  if(/^https:\/\/images\.igdb\.com\/igdb\/image\/upload\/t_(?:1080p|screenshot_big)(?:_2x)?\/[-a-zA-Z0-9_]+\.jpg$/.test(source||''))return source.replace(/\/t_[^/]+\//,`/t_${width===640?'screenshot_big':'1080p'}/`);
  try{const url=new URL(source);if(url.hostname==='media.rawg.io'&&/^\/media\/(games|screenshots)\//.test(url.pathname)&&[640,1920].includes(width)){url.pathname=url.pathname.replace('/media/',`/media/resize/${width}/-/`);return url.href;}}catch{}
  return source;
}
export function gameImageSet(source){return [640,1920].map(width=>`${gameImageSource(source,width)} ${width===640&&source?.startsWith('https://images.igdb.com/')?889:width}w`).join(', ');}
export function quickGameReview(item,prior,value,signedIn,now=new Date()){
  const rating=parseRating(value);
  if(item?.categoria!=='jogos'||!validReleaseDate(item.estreia)||item.estreia>releaseDay(now))throw Error('GAME_UNRELEASED');
  const record={texto:'',spoiler:false,favorito:false,data:releaseDay(now),...prior,nota:rating,ratingScale:5,public:reviewIsPublic(prior,signedIn),item,atualizadoEm:now.toISOString()};
  if(!validReview({rating,date:record.data,text:record.texto},now))throw Error('INVALID_RATING');
  return record;
}
