export const GAME_REVIEW_HASH = '#sua-jornada';
export function gameReviewHref(id, edit = false) {
  if (!['number','string'].includes(typeof id) || !/^[1-9][0-9]{0,9}$/.test(String(id))) return null;
  return `/obra/jogos/${id}${edit ? '?editar=1' : ''}${GAME_REVIEW_HASH}`;
}
export function legacyGameReviewRedirect(query = {}) {
  return query.categoria === 'jogos' && typeof query.id === 'string' ? gameReviewHref(query.id,query.editar==='1') : null;
}
