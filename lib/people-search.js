// Minimal public identity snapshots, scoped to the current browser/account.
export const recentPeopleKey = userId => `void:people-recent:${userId || 'guest'}:v1`;
export function readRecentPeople(storage, key) {
  try {
    const rows = JSON.parse(storage.getItem(key) || '[]');
    return Array.isArray(rows) ? rows.filter(person => typeof person?.user_id === 'string' && typeof person.username === 'string' && typeof person.display_name === 'string').slice(0, 5) : [];
  } catch { return []; }
}
export function addRecentPerson(storage, key, person) {
  const identity = { user_id: person.user_id, username: person.username, display_name: person.display_name, avatar_url: person.avatar_url || '' };
  const rows = [identity, ...readRecentPeople(storage, key).filter(row => row.user_id !== identity.user_id)].slice(0, 5);
  storage.setItem(key, JSON.stringify(rows));
  return rows;
}
