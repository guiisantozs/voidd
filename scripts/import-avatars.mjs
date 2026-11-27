import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { validateAvatarManifest } from '../lib/avatar-manifest.js';

export async function prepareAvatarImport(folder, manifestPath, output) {
  const root = await fs.realpath(folder), rows = validateAvatarManifest(JSON.parse(await fs.readFile(manifestPath, 'utf8'))), prepared = [];
  await fs.mkdir(output, { recursive: true });
  for (const { file, ...record } of rows) {
    const source = await fs.realpath(path.resolve(root, file));
    const relative = path.relative(root, source);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw Error(`Arquivo fora da pasta: ${file}`);
    const bytes = await fs.readFile(source), image = sharp(bytes, { limitInputPixels: 40000000 }).rotate();
    const hash = createHash('sha256').update(bytes).update('void-avatar-webp-v1').digest('hex').slice(0, 16);
    const files = [];
    for (const size of [96, 192, 384]) {
      const name = `${record.slug}/${hash}/${size}.webp`, destination = path.join(output, name);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      const buffer = await image.clone().resize(size, size, { fit: 'cover', position: 'centre' }).webp({ quality: 86 }).toBuffer();
      if (buffer.length > 1048576) throw Error(`Imagem otimizada muito grande: ${record.slug}`);
      await fs.writeFile(destination, buffer); files.push({ name, bytes: buffer.length });
    }
    prepared.push({ record: { ...record, image_path: `${record.slug}/${hash}/384.webp` }, files });
  }
  await fs.writeFile(path.join(output, 'prepared.json'), JSON.stringify(prepared, null, 2) + '\n');
  return prepared;
}
export async function publishAvatarImport(client, prepared, output) {
  for (const { record, files } of prepared) {
    for (const file of files) {
      const bytes = await fs.readFile(path.join(output, file.name));
      const { error } = await client.storage.from('avatars').upload(file.name, bytes, { contentType: 'image/webp', cacheControl: '31536000', upsert: true });
      if (error) throw Error(`Falha no upload de ${record.slug}. A linha não foi publicada.`);
    }
    // Publish only once every size exists. Stable slug preserves the avatar UUID.
    const { error } = await client.from('avatars').upsert(record, { onConflict: 'slug' });
    if (error) throw Error(`Falha ao publicar ${record.slug}. Confira a migration e a credencial de administrador.`);
  }
}
async function main() {
  const args = process.argv.slice(2), value = key => args[args.indexOf(key) + 1];
  if (!args.includes('--folder') || !value('--folder')) throw Error('Uso: npm run avatars:import -- --folder "pasta" [--manifest avatars/avatars-manifest.json] [--prepare-only]');
  const output = path.resolve(args.includes('--output') ? value('--output') : 'tmp/avatars-import');
  const prepared = await prepareAvatarImport(value('--folder'), args.includes('--manifest') ? value('--manifest') : 'avatars/avatars-manifest.json', output);
  if (!args.includes('--prepare-only')) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw Error('Imagens preparadas. Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY somente no ambiente do terminal para publicar. Nunca use NEXT_PUBLIC_ para a chave de serviço.');
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    await publishAvatarImport(client, prepared, output);
  }
  console.log(`${prepared.length} avatares ${args.includes('--prepare-only') ? 'preparados localmente' : 'importados no Storage e catálogo'}. Três tamanhos WebP por avatar.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
