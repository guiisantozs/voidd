import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareAvatar, avatarFileError, avatarObjectName, avatarStoragePath, saveProfileWithAvatar, signedAvatarUrl, AVATAR_OUTPUT_MAX_BYTES } from '../lib/profile-images.js';

function browser(t, { width = 3000, height = 2000, encode } = {}) {
  const previous = { Image: globalThis.Image, document: globalThis.document };
  const draws = [], sizes = [], calls = [];
  globalThis.Image = class { naturalWidth = width; naturalHeight = height; decode() { return Promise.resolve(); } };
  globalThis.document = { createElement: tag => {
    assert.equal(tag, 'canvas');
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: (...args) => { draws.push(args.slice(1)); sizes.push(canvas.width); } }), toBlob(callback, mime, quality) { calls.push({ mime, quality, size: canvas.width }); callback(encode ? encode(mime, canvas.width, quality) : new Blob(['encoded'], { type: mime })); } };
    return canvas;
  } };
  t.after(() => { if (previous.Image === undefined) delete globalThis.Image; else globalThis.Image = previous.Image; if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document; });
  return { draws, calls, sizes };
}
const file = () => new File(['test-fixture'], 'phone.jpg', { type: 'image/jpeg' });
test('landscape and portrait photos are centrally cropped to a square without stretching', async t => {
  const state = browser(t);
  const photo = await prepareAvatar(file());
  assert.equal(photo.type, 'image/webp');
  assert.deepEqual(state.draws[0], [500, 0, 2000, 2000, 0, 0, 512, 512]);
});
test('small images are accepted without a minimum dimension requirement or upscaling', async t => {
  const state = browser(t, { width: 30, height: 90 });
  await prepareAvatar(file());
  assert.deepEqual(state.draws[0], [0, 30, 30, 30, 0, 0, 30, 30]);
});
test('a browser PNG fallback is retained as PNG instead of being rejected or mislabeled as WebP', async t => {
  browser(t, { encode: () => new Blob(['png-output'], { type: 'image/png' }) });
  const photo = await prepareAvatar(file());
  assert.equal(photo.type, 'image/png');
  assert.match(avatarObjectName('00000000-0000-4000-8000-000000000001', photo.type), /[.]png$/);
});
test('a null WebP encoder falls back to JPEG and output over 1 MiB is resized again', async t => {
  const state = browser(t, { encode: (mime, size) => mime === 'image/webp' ? null : size === 512 ? new Blob([new Uint8Array(AVATAR_OUTPUT_MAX_BYTES + 1)], { type: mime }) : new Blob(['jpeg-output'], { type: mime }) });
  const photo = await prepareAvatar(file());
  assert.equal(photo.type, 'image/jpeg');
  assert.ok(photo.size <= AVATAR_OUTPUT_MAX_BYTES);
  assert.deepEqual(state.sizes, [512, 384]);
});
test('decoder failures and photos above the actual pixel safety limit remain explicit errors', async t => {
  browser(t, { width: 16000, height: 12000 });
  await assert.rejects(prepareAvatar(file()), /120 megapixels/);
  assert.equal(avatarFileError({ name: 'camera.JPG', type: '', size: 12000000 }), '');
  assert.match(avatarFileError({ type: 'image/heic', size: 1000 }), /HEIC/);
  assert.match(avatarFileError({ type: 'image/jpeg', size: 21 * 1024 * 1024 }), /20 MB/);
});

function backend({ uploadError, profileError } = {}) {
  const events = [];
  const baseUrl = 'https://test.supabase.co', userId = '00000000-0000-4000-8000-000000000001';
  const storage = {
    upload: async (path, photo, options) => { events.push({ action: 'upload', path, photo, options }); return { error: uploadError }; },
    getPublicUrl: path => ({ data: { publicUrl: `${baseUrl}/storage/v1/object/public/profile-avatars/${path}` } }),
    remove: async paths => { events.push({ action: 'remove', paths }); return {}; },
  };
  const client = { storage: { from: bucket => { assert.equal(bucket, 'profile-avatars'); return storage; } }, from: table => { assert.equal(table, 'void_community_profiles'); return { upsert: async identity => { events.push({ action: 'save', identity }); return { error: profileError }; } }; } };
  const previousAvatar = `${baseUrl}/storage/v1/object/public/profile-avatars/${userId}/00000000-0000-4000-8000-000000000002.webp`;
  const args = { client, userId, form: { display_name: ' Pessoa ', username: 'pessoa', bio: ' bio ', avatar_url: previousAvatar, visibility: 'private' }, previousAvatar, baseUrl };
  return { events, args };
}
test('actual output MIME, filename and stored profile reference agree; old photos are cleaned only after saving', async () => {
  const { events, args } = backend();
  const photo = new Blob(['encoded'], { type: 'image/jpeg' });
  const identity = await saveProfileWithAvatar({ ...args, photo });
  assert.deepEqual(events.map(e => e.action), ['upload', 'save', 'remove']);
  assert.match(events[0].path, /[.]jpg$/);
  assert.equal(events[0].options.contentType, 'image/jpeg');
  assert.equal(events[0].options.upsert, false);
  assert.equal(identity.display_name, 'Pessoa');
  assert.equal(identity.visibility, 'private');
  assert.equal(avatarStoragePath(identity.avatar_url, args.baseUrl), events[0].path);
});
test('a failed profile save rolls back the new upload and preserves the previous photo', async () => {
  const error = { code: '23505' }, { events, args } = backend({ profileError: error });
  await assert.rejects(saveProfileWithAvatar({ ...args, photo: new Blob(['encoded'], { type: 'image/png' }) }), e => e === error);
  assert.equal(events.at(-1).paths[0], events[0].path);
  assert.notEqual(events.at(-1).paths[0], avatarStoragePath(args.previousAvatar, args.baseUrl));
});
test('failed uploads do not rewrite the profile reference', async () => {
  const { events, args } = backend({ uploadError: { status: 403 } });
  await assert.rejects(saveProfileWithAvatar({ ...args, photo: new Blob(['encoded'], { type: 'image/webp' }) }), /enviar a foto/);
  assert.equal(events.some(e => e.action === 'save'), false);
});
test('an uncertain save response never deletes an avatar that may already be stored in the profile', async () => {
  const { events, args } = backend({ profileError: { message: 'Lost response' } });
  await assert.rejects(saveProfileWithAvatar({ ...args, photo: new Blob(['encoded'], { type: 'image/png' }) }));
  assert.equal(events.some(e => e.action === 'remove'), false);
});
test('signed avatar URLs share concurrent work, expire, and remain scoped to the viewer', async () => {
  let requests = 0;
  const client = { storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: `signed-${++requests}` } }) }) } };
  assert.deepEqual(await Promise.all([signedAvatarUrl(client, 'path', 'a', 0), signedAvatarUrl(client, 'path', 'a', 1)]), ['signed-1', 'signed-1']);
  assert.equal(await signedAvatarUrl(client, 'path', 'guest', 2), 'signed-2');
  assert.equal(await signedAvatarUrl(client, 'path', 'a', 90001), 'signed-3');
});
