import { itemKey } from './catalog.js';
import { completeGameReview } from './game-review.js';
import { parseRating } from './ratings.js';
import { validReview, reviewMovie, cleanReviewText } from './review-detail.js';

// One local write path for /avaliar, the game editor and the finish prompt.
// The caller binds storage to the owner before awaiting synchronization.
export function saveReviewRecord({ storage, item, form, signedIn, draft = false, onlyIfUnreviewed = false, now = new Date() }) {
  const key = itemKey(item);
  const reviews = JSON.parse(storage.getItem('void:reviews:v1') || '{}');
  if (!reviews || Array.isArray(reviews) || typeof reviews !== 'object') throw Error('INVALID_STORAGE');
  const prior = reviews[key];
  if (onlyIfUnreviewed && prior) return { record: prior, alreadyReviewed: true };
  if (!draft && !validReview({ rating: form.nota, date: form.data, text: form.texto }, now)) throw Error('INVALID_REVIEW');
  const rating = parseRating(form.nota);
  const record = item.categoria === 'jogos' ? completeGameReview(item, prior, form, signedIn, now, draft) : {
    ...prior, ...form, public: !!signedIn && form.public === true,
    nota: Number.isFinite(rating) ? rating : '', ratingScale: 5,
    texto: cleanReviewText(form.texto), item: ['filmes','series','animes'].includes(item.categoria) ? reviewMovie(item) : item,
    atualizadoEm: now.toISOString(),
  };
  if (draft) storage.setItem(`void:draft:${key}`, JSON.stringify(record));
  else {
    storage.setItem('void:reviews:v1', JSON.stringify({ ...reviews, [key]: record }));
    storage.removeItem(`void:draft:${key}`);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('void:account-data'));
  }
  return { record, alreadyReviewed: false };
}
