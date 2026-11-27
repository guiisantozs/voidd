// User ratings are always 0..5, with one decimal. Catalogue source values
// remain separate; in particular TMDB's vote_average is never overwritten.
export function parseRating(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return NaN;
  if (typeof value === 'string' && !/^\d+(?:[.,]\d)?$/.test(value.trim())) return NaN;
  const number = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(number) && number >= 0 && number <= 5
    && Math.abs(number * 10 - Math.round(number * 10)) < 1e-8 ? number : NaN;
}

export function normalizeReview(record) {
  if (!record || typeof record !== 'object') return record;
  const score = record.nota;
  // Historical Void records are already /5. Never halve an ambiguous 4 or 5.
  if (Number.isFinite(score) && score >= 0 && score <= 10
    && (record.ratingScale === 10 || (record.ratingScale == null && score > 5))) {
    return { ...record, nota: Math.round(score * 5) / 10, ratingScale: 5,
      originalRating: { value: score, scale: 10 } };
  }
  return record;
}

export function tmdbDisplayRating(item) {
  if (Number.isFinite(item?.tmdbRating)) return item.tmdbVoteCount > 0 ? item.tmdbRating / 2 : null;
  return item?.nota ?? null;
}
