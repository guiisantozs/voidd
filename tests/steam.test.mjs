import test from 'node:test';
import assert from 'node:assert/strict';
import { newSteamFlow, steamFlowHash, steamLoginUrl, steamOrigin, steamReturnTo, verifySteamAssertion, STEAM_ENDPOINT } from '../lib/steam-openid.js';
import { steamRequest } from '../lib/steam-client.js';
import { createSteamHandler } from '../pages/api/steam/index.js';
import { createSteamCallback } from '../pages/api/steam/callback.js';

const actor = '00000000-0000-4000-8000-000000000001';
const steamId = '76561198000000001';
const origin = 'http://localhost:3000';
function assertion(returnTo, now = Date.now()) {
  return { 'openid.ns': 'http://specs.openid.net/auth/2.0', 'openid.mode': 'id_res', 'openid.op_endpoint': STEAM_ENDPOINT, 'openid.return_to': returnTo, 'openid.claimed_id': 'https://steamcommunity.com/openid/id/' + steamId, 'openid.identity': 'https://steamcommunity.com/openid/id/' + steamId, 'openid.response_nonce': new Date(now).toISOString().replace('.000Z', 'Z').replace(/\.\d{3}Z$/, 'Z') + 'nonce', 'openid.assoc_handle': 'handle', 'openid.signed': 'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle', 'openid.sig': 'signature' };
}
function response() {
  return { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; }, end() { return this; }, redirect(code, url) { this.statusCode = code; this.location = url; return this; } };
}
function clients(results = [], rpcError = null) {
  const calls = [];
  return { calls, auth: { auth: { getUser: async token => token === 'live-token' ? { data: { user: { id: actor } } } : { data: {}, error: true } } }, admin: {
    rpc: async (name, args) => { calls.push({ name, args }); return { error: rpcError }; },
    from(table) {
      calls.push({ table });
      const result = results.shift();
      const builder = new Proxy({}, { get(_, key) {
        if (key === 'then') return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
        return (...args) => { calls.push({ operation: key, args }); return builder; };
      } });
      return builder;
    },
  } };
}
function request(method, body, cookie) {
  return { method, body, headers: { host: 'localhost:3000', origin, authorization: 'Bearer live-token', ...(cookie ? { cookie: 'void_steam_flow=' + cookie } : {}) } };
}

test('Steam state is random, browser-bound and hashed; redirects use a configured origin', () => {
  const a = newSteamFlow(), b = newSteamFlow();
  assert.notEqual(a.state, b.state);
  assert.notEqual(a.hash, b.hash);
  assert.equal(steamFlowHash(a.cookie, a.state), a.hash);
  assert.throws(() => steamFlowHash(a.cookie, b.state));
  assert.throws(() => steamFlowHash('attacker'));
  const url = new URL(steamLoginUrl(origin, a.state));
  assert.equal(url.origin + url.pathname, STEAM_ENDPOINT);
  assert.equal(url.searchParams.has('key'), false, 'Steam OpenID never asks the visitor for an API key');
  assert.equal(url.searchParams.get('openid.return_to'), steamReturnTo(origin, a.state));
  assert.equal(steamOrigin({ headers: { host: 'evil.example' } }, { NODE_ENV: 'production', STEAM_SITE_URL: 'https://void.example' }), 'https://void.example');
  assert.throws(() => steamOrigin({ headers: { host: 'evil.example' } }, { NODE_ENV: 'production' }));
  for (const value of ['http://void.example', 'https://a:b@void.example', 'https://void.example/elsewhere', 'https://void.example/?x=1']) assert.throws(() => steamOrigin({}, { STEAM_SITE_URL: value }));
});

test('Steam assertion is checked directly with Steam and requires every security field to be signed', async () => {
  const returnTo = steamReturnTo(origin, newSteamFlow().state);
  const now = Date.now();
  const query = assertion(returnTo, now);
  let requests = 0;
  const fetcher = async (url, init) => {
    requests++;
    assert.equal(url, STEAM_ENDPOINT);
    assert.equal(init.redirect, 'error');
    assert.equal(new URLSearchParams(init.body).get('openid.mode'), 'check_authentication');
    return { ok: true, text: async () => 'ns:http://specs.openid.net/auth/2.0\nis_valid:true\n' };
  };
  assert.equal(await verifySteamAssertion(query, returnTo, { fetcher, now }), steamId);
  for (const patch of [
    { 'openid.op_endpoint': 'https://evil.example' }, { 'openid.return_to': returnTo + '&other=1' },
    { 'openid.identity': 'https://steamcommunity.com/openid/id/76561198000000002' },
    { 'openid.claimed_id': ['duplicate', query['openid.claimed_id']] },
    { 'openid.signed': 'identity,claimed_id' }, { 'openid.ns': 'other' }, { 'openid.mode': 'cancel' },
    { 'openid.response_nonce': '2000-01-01T00:00:00Zold' },
    { 'openid.response_nonce': new Date(now + 120000).toISOString().replace(/\.\d{3}Z$/, 'Z') + 'future' },
  ]) await assert.rejects(verifySteamAssertion({ ...query, ...patch }, returnTo, { fetcher, now }));
  assert.equal(requests, 1, 'invalid assertions never reach an arbitrary endpoint');
  await assert.rejects(verifySteamAssertion(query, returnTo, { now, fetcher: async () => ({ ok: true, text: async () => 'is_valid:false\n' }) }));
  await assert.rejects(verifySteamAssertion(query, returnTo, { now, fetcher: async () => ({ ok: false }) }));
});

test('Steam API authenticates the live VOID user, scopes reads and rejects cross-origin mutations', async () => {
  const service = clients([{ data: { steam_id: steamId }, error: null }]);
  const handler = createSteamHandler(() => service);
  let res = response();
  await handler(request('GET'), res);
  assert.equal(res.body.connection.steam_id, steamId);
  assert(service.calls.some(call => call.operation === 'eq' && call.args[0] === 'user_id' && call.args[1] === actor));
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
  for (const auth of ['', 'Bearer forged']) {
    res = response(); const req = request('POST', { action: 'connect' }); req.headers.authorization = auth;
    await handler(req, res); assert.equal(res.statusCode, 401);
  }
  res = response(); const req = request('DELETE'); req.headers.origin = 'https://evil.example';
  await handler(req, res); assert.equal(res.statusCode, 403);
  assert.equal(service.calls.filter(call => call.name).length, 0);
});

test('Steam connect uses an HttpOnly cookie, completion passes the hash and disconnect invalidates flows', async () => {
  const service = clients(); const handler = createSteamHandler(() => service);
  let res = response(); await handler(request('POST', { action: 'connect' }), res);
  assert.equal(res.statusCode, 200);
  assert(res.headers['Set-Cookie'].includes('HttpOnly; SameSite=Lax'));
  assert(!JSON.stringify(res.body).includes('live-token'));
  const cookie = res.headers['Set-Cookie'].split(';')[0].slice('void_steam_flow='.length);
  const start = service.calls.find(call => call.args?.p_action === 'start');
  assert.equal(start.args.p_hash, steamFlowHash(cookie));
  res = response(); await handler(request('POST', { action: 'complete' }, cookie), res);
  assert.equal(res.statusCode, 200);
  assert(res.headers['Set-Cookie'].includes('Max-Age=0'));
  assert(service.calls.some(call => call.args?.p_action === 'complete' && call.args.p_user_id === actor));
  res = response(); await handler(request('DELETE'), res);
  assert.equal(res.statusCode, 200);
  assert(service.calls.some(call => call.args?.p_action === 'disconnect' && call.args.p_user_id === actor));
  res = response(); await createSteamHandler(() => clients([], { message: 'INVALID_FLOW' }))(request('POST', { action: 'complete' }, cookie), res);
  assert.equal(res.statusCode, 400);
});

test('Steam callback validates state before verification and only marks an unexpired challenge', async () => {
  const flow = newSteamFlow();
  const service = clients([{ data: { expires_at: new Date(Date.now() + 60000).toISOString() } }, { data: [{ token_hash: flow.hash }] }]);
  let verified = 0;
  const handler = createSteamCallback(() => service, async () => { verified++; return steamId; });
  let res = response();
  await handler({ ...request('GET', null, flow.cookie), query: { state: newSteamFlow().state } }, res);
  assert.equal(verified, 0);
  assert(res.location.endsWith('?steam=error'));
  res = response();
  await handler({ ...request('GET', null, flow.cookie), query: { state: flow.state } }, res);
  assert.equal(verified, 1);
  assert(res.location.endsWith('?steam=complete'));
  assert(service.calls.some(call => call.operation === 'update' && call.args[0].steam_id === steamId));
  assert.equal(service.calls.filter(call => call.name).length, 0, 'callback cannot finalize a link without the VOID session');
  res = response();
  await handler({ ...request('GET', null, flow.cookie), query: { state: flow.state, 'openid.mode': 'cancel' } }, res);
  assert(res.location.endsWith('?steam=cancelled'));
});

test('Steam client rejects a changed VOID account before sending any request', async () => {
  let sent = false;
  const client = { auth: { getSession: async () => ({ data: { session: { user: { id: 'other' }, access_token: 'do-not-send' } } }) } };
  await assert.rejects(steamRequest(client, actor, { fetcher: async () => { sent = true; } }));
  assert.equal(sent, false);
});

test('Steam API reports configuration failures without exposing configuration values or internal errors', async () => {
  let res = response();
  await createSteamHandler(() => { throw Error('CONFIG'); })(request('GET'), res);
  assert.equal(res.statusCode, 503);
  assert.match(res.body.message, /configurada/);
  res = response();
  await createSteamHandler(() => { throw Error('private-internal-error'); })(request('GET'), res);
  assert.equal(res.statusCode, 503);
  assert(!JSON.stringify(res.body).includes('private-internal-error'));
});
