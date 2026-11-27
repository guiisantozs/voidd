// Manual dates use noon UTC, so their calendar day stays stable in São Paulo.
export function journeyDateValue(value) {
  if (typeof value !== 'string' || !value || !Number.isFinite(Date.parse(value))) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
export function journeyTimestamp(value) {
  if (!value) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error('INVALID_JOURNEY_DATE');
  const date = new Date(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw Error('INVALID_JOURNEY_DATE');
  return date.toISOString();
}
export function formatJourneyDate(value) {
  if (!journeyDateValue(value)) return '';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)).replaceAll(' de ', ' ').replace('.', '');
}
export function transitionJourney(prior, previous, status, now = new Date()) {
  const dates = { started_at: prior?.started_at || null, finished_at: prior?.finished_at || null };
  if (previous === status) return dates;
  if (status === 'playing' || status === 'playing_now') { dates.started_at ||= now.toISOString(); dates.finished_at = null; }
  if (status === 'finished' || status === 'platinum') dates.finished_at = now.toISOString();
  return dates;
}

export const GAME_STATUS_SAVED = 'void:game-status-saved';
export const GAME_REVIEW_REQUESTED = 'void:game-review-requested';
export const reviewStatusKeys = ['abandoned', 'finished', 'platinum'];
const skipped = new Set();
const promptKey = (owner, id) => `void:finish-review:${owner || 'guest'}:${id}`;
export function skipFinishReview(storage, owner, id) {
  const key = promptKey(owner, id); skipped.add(key);
  try { storage?.setItem(key, 'skipped'); } catch { /* The in-memory set still covers this session. */ }
}
export function shouldOfferFinishReview(storage, owner, item, status, previous, reviews) {
  if (item?.categoria !== 'jogos' || !reviewStatusKeys.includes(status) || status === previous || reviews?.[`jogos:${item.id}`]) return false;
  const key = promptKey(owner, item.id);
  if (skipped.has(key)) return false;
  try { return storage?.getItem(key) !== 'skipped'; } catch { return true; }
}
