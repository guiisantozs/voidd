const dismissed = new Set();

export function updateSeenKey(update, userId) {
  if (!update || !/^[a-z0-9_-]+$/i.test(update.id || '') || !/^[a-z0-9_-]+$/i.test(update.version || '') || typeof userId !== 'string' || !userId) return null;
  return `void_update_${update.id}_${update.version}:${encodeURIComponent(userId)}`;
}

export function shouldShowUpdate(storage, update, userId) {
  const key = updateSeenKey(update, userId);
  if (!key || update.enabled === false || dismissed.has(key)) return false;
  try { return !storage?.getItem(key); } catch { return true; }
}

export function markUpdateSeen(storage, update, userId) {
  const key = updateSeenKey(update, userId);
  if (!key) return false;
  dismissed.add(key);
  try { storage?.setItem(key, 'seen'); return !!storage; } catch { return false; }
}
