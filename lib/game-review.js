import { cleanReviewText, reviewIsPublic, validReview } from './review-detail.js';
import { parseRating } from './ratings.js';
import { validReleaseDate, releaseDay } from './movie-release.js';
import { reviewFeedContext, FEED_STATUS } from './reviews-feed.js';

export function gameReviewForm(record, signedIn, now = new Date()) {
  return { nota: record?.nota ?? '', texto: record?.texto || '', spoiler: !!record?.spoiler,
    favorito: !!record?.favorito, public: reviewIsPublic(record, signedIn),
    data: record?.data || releaseDay(now), recommendation: record?.recommendation ?? '',
    positives: record?.positives || '', negatives: record?.negatives || '',
    feed_context: { share_status: record?.feed_context?.share_status === true,
      status: Object.hasOwn(FEED_STATUS, record?.feed_context?.status || '') ? record.feed_context.status : '',
      platform: typeof record?.feed_context?.platform === 'string' ? record.feed_context.platform.slice(0,60) : '',
      marked_at: record?.feed_context?.marked_at || null } };
}

export function completeGameReview(item, prior, form, signedIn, now = new Date(), draft = false) {
  const record = { ...prior, ...form, item, nota: parseRating(form.nota), ratingScale: 5,
    texto: cleanReviewText(form.texto), positives: cleanReviewText(form.positives, 500),
    negatives: cleanReviewText(form.negatives, 500),
    recommendation: ['yes', 'no'].includes(form.recommendation) ? form.recommendation : '',
    public: !!signedIn && form.public === true, atualizadoEm: now.toISOString(),
    feed_context: reviewFeedContext(form.feed_context, form.feed_context?.status, now) };
  if (item?.categoria !== 'jogos') throw Error('INVALID_GAME');
  if (!draft && (!validReleaseDate(item.estreia) || item.estreia > releaseDay(now))) throw Error('GAME_UNRELEASED');
  if (!draft && !validReview({ rating: record.nota, text: record.texto, date: record.data }, now)) throw Error('INVALID_REVIEW');
  if (draft && !Number.isFinite(record.nota)) record.nota = '';
  return record;
}
