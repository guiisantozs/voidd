export const AUTH_SUCCESS_KEY = 'void:auth-success:v1';
export const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
export function konamiStep(index, key) {
  if (typeof key !== 'string' || !key) return index;
  const normalized = key.length === 1 ? key.toLowerCase() : key;
  return normalized === KONAMI[index] ? index + 1 : normalized === KONAMI[0] ? 1 : 0;
}
export function markAuthSuccess(storage, user, now = Date.now()) {
  storage.setItem(AUTH_SUCCESS_KEY, JSON.stringify({ id: user?.id || null, at: now }));
}
export function authSuccessPending(storage, user, recovery, now = Date.now()) {
  const raw = storage.getItem(AUTH_SUCCESS_KEY);
  if (!raw) return false;
  try {
    const value = JSON.parse(raw);
    return !recovery && !!user && (value.id === null || value.id === user.id) && now >= value.at && now - value.at < 300000;
  } catch { return false; }
}
export function consumeAuthSuccess(storage, user, recovery, now = Date.now()) {
  const pending = authSuccessPending(storage, user, recovery, now);
  storage.removeItem(AUTH_SUCCESS_KEY);
  return pending;
}
