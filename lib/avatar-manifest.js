import path from 'node:path';
const types = ['filmes', 'series', 'jogos', 'animes', 'livros'];
export function validateAvatarManifest(manifest) {
  if (manifest?.version !== 1 || !Array.isArray(manifest.avatars) || !manifest.avatars.length) throw Error('Manifesto vazio ou versão inválida.');
  const slugs = new Set();
  return manifest.avatars.map((row, index) => {
    if (!row || typeof row.slug !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(row.slug) || row.slug.length > 120 || slugs.has(row.slug)) throw Error(`Slug inválido/duplicado no avatar ${index + 1}.`);
    slugs.add(row.slug);
    for (const [key, max] of [['character_name', 100], ['media_title', 200]]) if (typeof row[key] !== 'string' || !row[key].trim() || row[key].length > max) throw Error(`Campo ${key} inválido em ${row.slug}.`);
    if (!types.includes(row.media_type) || !['number', 'string'].includes(typeof row.media_id) || !/^[1-9][0-9]{0,9}$/.test(String(row.media_id))) throw Error(`Obra inválida em ${row.slug}. Use o ID da página, não o ID IGDB do universo.`);
    if (typeof row.file !== 'string' || !row.file || /[\\\u0000]/.test(row.file) || path.posix.isAbsolute(row.file) || row.file.split('/').some(part => part === '..' || part === '.') || !/\.(png|jpe?g|webp)$/i.test(row.file)) throw Error(`Arquivo inválido em ${row.slug}.`);
    if (row.bg_color != null && !/^#[\da-f]{6}$/i.test(row.bg_color)) throw Error(`Cor inválida em ${row.slug}.`);
    if (row.unlock_rule != null) throw Error('Regras de desbloqueio ainda não são suportadas pelo importador.');
    if (row.sort_order != null && !Number.isInteger(row.sort_order) || row.is_published != null && typeof row.is_published !== 'boolean') throw Error(`Ordenação/publicação inválida em ${row.slug}.`);
    return { slug: row.slug, character_name: row.character_name.trim(), media_type: row.media_type, media_id: String(row.media_id), media_title: row.media_title.trim(), file: row.file, bg_color: row.bg_color || null, sort_order: row.sort_order ?? index, is_published: row.is_published ?? true, unlock_rule: null };
  });
}
