export const AVATAR_BUCKET = 'profile-avatars';
export const AVATAR_MAX_BYTES = 20 * 1024 * 1024;
export const AVATAR_OUTPUT_MAX_BYTES = 1024 * 1024;
const avatarExtensions = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
export function avatarObjectName(userId, mime = 'image/webp') {
  if (!avatarExtensions[mime]) throw Error('Formato de avatar não suportado.');
  // getRandomValues also works on local HTTP addresses used to test on phones.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  return `${userId}/${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}.${avatarExtensions[mime]}`;
}
export function avatarFileError(file) {
  const mime = file?.type?.toLowerCase();
  if (!file || !(avatarExtensions[mime] || mime === 'image/jpg' || (!mime && /\.(jpe?g|png|webp)$/i.test(file.name || '')))) return 'Escolha uma imagem JPG, PNG ou WebP. Para HEIC/HEIF, exporte a foto como JPG.';
  if (!file.size) return 'Este arquivo está vazio. Escolha outra foto.';
  if (file.size > AVATAR_MAX_BYTES) return 'A foto original deve ter até 20 MB. Ela será reduzida automaticamente antes do envio.';
  return '';
}
export function avatarStoragePath(value, baseUrl) {
  try {
    const url = new URL(value), base = new URL(baseUrl);
    const prefix = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
    if (url.origin !== base.origin || !url.pathname.startsWith(prefix)) return '';
    const path = url.pathname.slice(prefix.length);
    return /^[\da-f-]{36}\/[\da-f-]{36}\.(webp|jpg|png)$/i.test(path) ? path : '';
  } catch { return ''; }
}
// Decode and re-encode locally: square crop, modest dimensions and no EXIF metadata.
export async function prepareAvatar(file) {
  const issue = avatarFileError(file);
  if (issue) throw Error(issue);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    if (typeof image.decode === 'function') { image.src = url; await image.decode(); }
    else await new Promise((resolve,reject) => { image.onload=resolve;image.onerror=()=>reject(Object.assign(Error('Não foi possível ler a foto.'),{name:'EncodingError'}));image.src=url; });
    if (!image.naturalWidth || !image.naturalHeight) throw Error('Não foi possível ler as dimensões da foto. Escolha outra imagem.');
    if (image.naturalWidth * image.naturalHeight > 120000000) throw Error('Esta foto ultrapassa 120 megapixels. Exporte uma versão menor para evitar falta de memória no navegador.');
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    for (const size of new Set([Math.min(512, side), Math.min(384, side), Math.min(256, side)])) {
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw Error('Seu navegador não conseguiu abrir o editor de imagens. Tente atualizar o navegador.');
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, (image.naturalWidth-side)/2, (image.naturalHeight-side)/2, side, side, 0, 0, size, size);
      for (const mime of ['image/webp', 'image/jpeg', 'image/png']) {
        for (const quality of mime === 'image/png' ? [undefined] : [.86, .7]) {
          let blob;
          try { blob = await new Promise(resolve => canvas.toBlob(resolve, mime, quality)); } catch { continue; }
          // Unsupported encoders may return PNG, rather than the requested MIME.
          // Use the actual output type and never label PNG bytes as WebP.
          if (blob?.size > 0 && blob.size <= AVATAR_OUTPUT_MAX_BYTES && avatarExtensions[blob.type]) return blob;
        }
      }
    }
    throw Error('O navegador não conseguiu converter esta foto para até 1 MB. Tente um JPG ou PNG ou atualize o navegador.');
  } catch (error) {
    if (error.name === 'EncodingError') throw Error('Não foi possível abrir essa foto. Escolha um JPG, PNG ou WebP válido.');
    throw error;
  } finally { URL.revokeObjectURL(url); }
}

export async function saveProfileWithAvatar({ client, userId, form, photo, previousAvatar, baseUrl }) {
  let uploaded = '', saved = false, canRemoveUploaded = true;
  const storage = client.storage.from(AVATAR_BUCKET);
  try {
    let avatar = form.avatar_url;
    if (photo) {
      if (!avatarExtensions[photo.type] || !photo.size || photo.size > AVATAR_OUTPUT_MAX_BYTES) throw Error('Foto processada inválida. Selecione a imagem novamente.');
      uploaded = avatarObjectName(userId, photo.type);
      const { error } = await storage.upload(uploaded, photo, { contentType: photo.type, cacheControl: '120', upsert: false });
      if (error) throw Object.assign(Error('Não foi possível enviar a foto. Confira a conexão e tente novamente.'), { cause: error });
      avatar = storage.getPublicUrl(uploaded).data.publicUrl;
    }
    const identity = { user_id: userId, ...form, ...(photo?{avatar_id:null}:{}), avatar_url: avatar, display_name: form.display_name.trim(), bio: form.bio.trim() };
    const { error } = await client.from('void_community_profiles').upsert(identity);
    if (error) {
      // A lost HTTP response can happen after the database committed. Do not
      // delete a photo the profile may already reference.
      if (uploaded && !error.code) {
        canRemoveUploaded = false;
        try {
          const check = await client.from('void_community_profiles').select('avatar_url').eq('user_id', userId).maybeSingle();
          if (!check.error) {
            saved = check.data?.avatar_url === avatar;
            canRemoveUploaded = !saved;
          }
        } catch { /* Preserve the upload if the commit cannot be checked. */ }
      }
      if (!saved) throw error;
    }
    saved = true;
    const old = avatarStoragePath(previousAvatar, baseUrl);
    if (old && old.startsWith(`${userId}/`) && previousAvatar !== avatar) {
      // Cleanup must not delay displaying an already saved photo.
      Promise.resolve(storage.remove([old])).catch(() => {});
    }
    return identity;
  } catch (error) {
    if (uploaded && !saved && canRemoveUploaded) await storage.remove([uploaded]).catch(() => {});
    throw error;
  }
}

const avatarClients = new WeakMap();
export function signedAvatarUrl(client, path, viewer, now = Date.now()) {
  let cache = avatarClients.get(client);
  if (!cache) { cache = new Map(); avatarClients.set(client, cache); }
  const key = `${viewer}:${path}`, cached = cache.get(key);
  if (cached && cached.until > now) return cached.promise;
  const entry = { until: now + 90000 };
  entry.promise = client.storage.from(AVATAR_BUCKET).createSignedUrl(path, 120).then(({ data, error }) => {
    if (error || !data?.signedUrl) throw error || Error('Imagem indisponível.');
    return data.signedUrl;
  }).catch(error => { if (cache.get(key) === entry) cache.delete(key); throw error; });
  if (cache.size >= 200) cache.delete(cache.keys().next().value);
  cache.set(key, entry);
  return entry.promise;
}
