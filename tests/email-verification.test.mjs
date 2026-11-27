import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerificationHandler } from '../supabase/functions/void-email-verification/handler.js';
import { authCooldownKey, cooldownRemaining, startAuthCooldown, signInWithOptionalEmail } from '../lib/email-verification.js';

function setup(overrides = {}) {
  const calls = [];
  const user = { id: 'account-a', email: 'owner@example.test', email_confirmed_at: '2026-10-21', user_metadata: { email_verified: true } };
  const auth = {
    getUser: async token => ({ data: { user: token === 'valid-session' ? user : null }, error: null }),
    signInWithOtp: async value => { calls.push(['send', value]); return {}; },
    verifyOtp: async value => { calls.push(['verify', value]); return { data: { user, session: { access_token: 'new-otp-session' } } }; },
    signInWithPassword: async () => ({ error: { code: 'invalid_credentials' } }),
    ...overrides.auth,
  };
  const admin = {
    from() { return {
      select() { return this; }, eq() { return this; },
      maybeSingle: async () => ({ data: overrides.record || null }),
      upsert: async row => { calls.push(['save', row]); return {}; },
    }; },
    rpc: async (name, args) => { calls.push([name, args]); return { data: overrides.claim ?? true }; },
    auth: { admin: {
      updateUserById: async (...args) => { calls.push(['confirm-access', ...args]); return {}; },
      signOut: async (...args) => { calls.push(['signOut', ...args]); return {}; },
    } },
  };
  const handler = createVerificationHandler({ makeClient: (_, key) => key === 'test-service' ? admin : { auth }, url: 'https://auth.example.test', publicKey: 'test-public', serviceKey: 'test-service', allowedOrigins: ['https://void.example'] });
  const request = (body, token = 'valid-session', method = 'POST') => handler(new Request('https://auth.example.test/function', { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) }));
  return { calls, request };
}

test('CORS rejects untrusted origins before authentication and varies approved preflights', async () => {
  let calls = 0;
  const handler = createVerificationHandler({ makeClient: () => { calls++; }, url: 'https://auth.example.test', publicKey: 'public', serviceKey: 'private', allowedOrigins: ['https://void.example'] });
  const denied = await handler(new Request('https://auth.example.test', { method: 'OPTIONS', headers: { Origin: 'https://attacker.example' } }));
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
  const allowed = await handler(new Request('https://auth.example.test', { method: 'OPTIONS', headers: { Origin: 'https://void.example' } }));
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'https://void.example');
  assert.equal(allowed.headers.get('Vary'), 'Origin');
  assert.equal(calls, 0);
});

test('verification rejects unapproved redirects and oversized bodies without Content-Length', async () => {
  const { request, calls } = setup();
  const response = await request({ action: 'request', redirectTo: 'https://attacker.example/verificar-email' });
  assert.equal(response.status, 400);
  assert.equal(calls.some(row => row[0] === 'send'), false);
  assert.equal((await request({ action: 'status', padding: 'a'.repeat(12001) })).status, 413);
});

test('verification requests require a validated session and never accept a client-selected recipient', async () => {
  const { request, calls } = setup();
  assert.equal((await request({ action: 'request' }, '')).status, 401);
  assert.equal((await request({ action: 'request' }, 'forged')).status, 401);
  assert.equal(calls.length, 0);
  const response = await request({ action: 'request', email: 'victim@example.test', user_id: 'b', redirectTo: 'https://void.example/verificar-email' });
  assert.equal(response.status, 200);
  assert.deepEqual(calls[0], ['void_email_verification_claim', { target: 'account-a' }]);
  assert.equal(calls[1][1].email, 'owner@example.test');
  assert.equal(calls[1][1].options.shouldCreateUser, false);
});
test('server cooldown prevents sending even when the browser timer is bypassed', async () => {
  const { request, calls } = setup({ claim: false });
  assert.equal((await request({ action: 'request', redirectTo: 'https://void.example/verificar-email' })).status, 429);
  assert.equal(calls.some(row => row[0] === 'send'), false);
});
test('autoconfirmed Auth users and editable metadata are not mailbox proof; proof is bound to the current email', async () => {
  for (const record of [null, { verified_at: 'now', verified_email: 'old@example.test' }]) {
    const { request } = setup({ record });
    assert.equal((await (await request({ action: 'status' })).json()).verified, false);
  }
  const { request } = setup({ record: { verified_at: 'now', verified_email: 'owner@example.test' } });
  assert.equal((await (await request({ action: 'status' })).json()).verified, true);
});
test('only a successfully verified email token records proof; no session is returned by the verification link', async () => {
  const { request, calls } = setup();
  assert.equal((await request({ action: 'verify', token_hash: 'bad' }, '')).status, 400);
  const response = await request({ action: 'verify', token_hash: 'a'.repeat(64), email: 'victim@example.test' }, '');
  assert.deepEqual(await response.json(), { verified: true });
  assert.deepEqual(calls[0], ['verify', { token_hash: 'a'.repeat(64), type: 'email' }]);
  assert.equal(calls[1][1].user_id, 'account-a');
  assert.equal(calls[1][1].verified_email, 'owner@example.test');
  assert.deepEqual(calls[2], ['signOut', 'new-otp-session', 'local']);
  const invalid = setup({ auth: { verifyOtp: async () => ({ error: { code: 'otp_expired' }, data: {} }) } });
  assert.equal((await invalid.request({ action: 'verify', token_hash: 'b'.repeat(64) }, '')).status, 400);
  assert.equal(invalid.calls.length, 0);
});
test('legacy login never confirms access on wrong passwords or accepts a client-supplied user ID', async () => {
  const { request, calls } = setup();
  assert.equal((await request({ action: 'legacy-login', email: 'owner@example.test', password: 'wrong', user_id: 'b' }, '')).status, 400);
  assert.equal(calls.some(row => row[0] === 'confirm-access'), false);
  assert.equal(calls.some(row => row[0] === 'save'), false);
});
test('legacy pending accounts require native password validation and enabled autoconfirm before unlocking access', async t => {
  const oldFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = oldFetch; });
  for (const enabled of [false, true]) {
    let attempts = 0;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ mailer_autoconfirm: enabled }) });
    const { request, calls } = setup({ claim: 'actual-account', auth: { signInWithPassword: async () => ++attempts === 1 ? { error: { code: 'email_not_confirmed' } } : { data: { session: { access_token: 'session', refresh_token: 'refresh' } } } } });
    assert.equal((await request({ action: 'legacy-login', email: 'owner@example.test', password: 'correct' }, '')).status, enabled ? 200 : 503);
    assert.equal(calls.some(row => row[0] === 'confirm-access'), enabled);
    assert.equal(calls.some(row => row[0] === 'save'), false);
  }
});
test('cooldowns survive reload, are scoped, expire, and tolerate blocked storage', () => {
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const key = authCooldownKey('verification', 'a');
  startAuthCooldown(storage, key, 1000);
  assert.equal(cooldownRemaining(storage, key, 1001), 60);
  assert.equal(cooldownRemaining(storage, key, 61000), 0);
  assert.equal(cooldownRemaining(storage, authCooldownKey('verification', 'b'), 1001), 0);
  assert.equal(cooldownRemaining({ getItem() { throw Error(); } }, key), 0);
});
test('native password sessions are preserved and legacy sessions are installed only after the server succeeds', async () => {
  const native = { data: { session: { access_token: 'native' } } };
  assert.equal(await signInWithOptionalEmail({ auth: { signInWithPassword: async () => native } }, {}), native);
  const session = { access_token: 'access', refresh_token: 'refresh' };
  const client = { auth: { signInWithPassword: async () => ({ error: { code: 'email_not_confirmed' } }), setSession: async value => ({ data: { session: value } }) }, functions: { invoke: async () => ({ data: { session } }) } };
  assert.deepEqual((await signInWithOptionalEmail(client, { email: 'owner@example.test', password: 'correct' })).data.session, session);
});
