export const AVATARS_BUCKET = 'avatars';
export const AVATAR_FIELDS = 'id,slug,character_name,media_type,media_id,media_title,image_path,bg_color,sort_order,is_published';
export const AVATAR_TYPES = [{ key: 'filmes', label: 'Filmes' }, { key: 'series', label: 'Séries' }, { key: 'jogos', label: 'Jogos' }, { key: 'animes', label: 'Animes' }, { key: 'livros', label: 'Livros' }];
export const AVATAR_CHANGED = 'void:avatar-changed';
export const avatarAlt = avatar => `Avatar: ${avatar.character_name} (${avatar.media_title})`;
export const avatarColor = avatar => /^#[\da-f]{6}$/i.test(avatar?.bg_color || '') ? avatar.bg_color : '#2b1d3b';
export function avatarImageUrl(avatar, size = 192, baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL) {
  if (!avatar || avatar.is_published === false || ![96, 192, 384].includes(size)) return '';
  const path = avatar.image_path;
  if (typeof path !== 'string' || !/^[a-z0-9-]+\/[a-f0-9]{16}\/384\.webp$/.test(path)) return '';
  try { const base = new URL(baseUrl); if (base.protocol !== 'https:') return ''; return `${base.origin}/storage/v1/object/public/${AVATARS_BUCKET}/${path.replace('/384.webp', `/${size}.webp`)}`; } catch { return ''; }
}
export function avatarGroups(rows, search = '', type = '') {
  const normalize = value => String(value).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');
  const query = normalize(search.trim()), groups = new Map();
  for (const row of rows) {
    if (row.is_published === false || type && row.media_type !== type || query && !normalize(`${row.character_name} ${row.media_title}`).includes(query)) continue;
    const key = `${row.media_type}:${row.media_id}`;
    if (!groups.has(key)) groups.set(key, { key, title: row.media_title, rows: [] });
    groups.get(key).rows.push(row);
  }
  return [...groups.values()];
}
export function safeAvatarReturn(value) {
  if (value === '/jogos/universos/the-last-of-us#avatares' || value === '/jogos/universos/god-of-war#avatares') return value;
  if (typeof value !== 'string' || !/^\/(?:obra\/(?:jogos|filmes|series|animes)\/[1-9]\d*|filme\/[1-9]\d*)\?tab=avatares$/.test(value)) return null;
  return value;
}
export async function readAvatars(client, { mediaType, mediaId, signal } = {}) {
  if (!client) return [];
  let query = client.from('avatars').select(AVATAR_FIELDS).eq('is_published', true).order('sort_order').order('slug');
  if (mediaType && mediaId) query = query.eq('media_type', mediaType).eq('media_id', String(mediaId));
  if (signal) query = query.abortSignal(signal);
  // Page through published catalogues rather than silently truncating at the API row limit.
  const rows = [];
  for (let offset = 0; ; offset += 200) { const { data, error } = await query.range(offset, offset + 199); if (error) throw error; rows.push(...(data || [])); if (!data || data.length < 200) return rows; }
}
export async function saveCharacterAvatar(client, userId, avatarId) {
  if (!client || !userId) throw Error('AUTH_REQUIRED');
  const { data, error } = await client.from('void_community_profiles').update({ avatar_id: avatarId || null }).eq('user_id', userId).select('user_id,display_name,username,avatar_url,avatar_id').single();
  if (error) throw error;
  if (!data || data.user_id !== userId) throw Error('PROFILE_NOT_SAVED');
  return data;
}
