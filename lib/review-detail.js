import { parseRating } from './ratings.js';

// Only new signed-in reviews default to public. Never republish an existing
// private/legacy review or a visitor's local record just by opening an editor.
export function reviewIsPublic(record, signedIn) {
  if (!signedIn) return false;
  return record ? record.public === true : true;
}

export const REVIEW_LIMIT=2000;
export function reviewMovie(item) {
  const keys=['id','categoria','titulo','poster','posterPath','backdrop','backdropPath','ano','estreia','releaseStatus','nota','tmdbRating','tmdbVoteCount','sinopse','genreIds','generos','provider','providerId','malId','externalRating','externalVoteCount','externalRatingSource','fonte','format'];
  return Object.fromEntries(keys.filter(key=>item[key]!==undefined).map(key=>[key,item[key]]));
}
export function cleanReviewText(value,limit=REVIEW_LIMIT) {
  // Text only: React escapes HTML at render time; never use dangerouslySetInnerHTML.
  return String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,limit);
}
export function reviewError(error) {
  if(error?.code==='MOVIE_RELEASE')return error.message;
  if(error?.message?.includes('MOVIE_UNRELEASED')||error?.message?.includes('MOVIE_RELEASE_UNKNOWN'))return 'Este filme ainda não teve seu lançamento confirmado. A avaliação não foi publicada.';
  if(error?.message?.includes('NAME_CORRECTION_REQUIRED'))return 'Corrija seu nome de perfil antes de publicar.';
  if(error?.code==='23505')return 'Você já enviou essa interação.';
  if(error?.code==='P0001')return 'Limite de envios atingido. Aguarde um minuto e tente novamente.';
  if(error?.code==='42501')return 'Ação não permitida. Entre novamente e confira se a avaliação ainda é pública.';
  return 'Não foi possível concluir. Confira sua conexão e tente novamente.';
}
export function validReview(form,now=new Date()) {
  const today=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);
  const date=new Date(`${form.date}T12:00:00Z`);
  return Number.isFinite(parseRating(form.rating))
    && /^\d{4}-\d{2}-\d{2}$/.test(form.date||'')&&form.date<=today&&Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===form.date
    &&typeof form.text==='string'&&form.text.length<=REVIEW_LIMIT;
}
