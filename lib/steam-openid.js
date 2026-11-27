import { createHash, randomBytes } from 'node:crypto';

export const STEAM_ENDPOINT = 'https://steamcommunity.com/openid/login';
export const STEAM_TTL = 600;
const NS = 'http://specs.openid.net/auth/2.0';
const IDENTIFIER = NS + '/identifier_select';

export function newSteamFlow() {
  const state = randomBytes(32).toString('hex');
  const secret = randomBytes(32).toString('hex');
  return { state, cookie: state + '.' + secret, hash: steamFlowHash(state + '.' + secret) };
}

export function steamFlowHash(cookie, state) {
  if (!/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(cookie || '') || (state !== undefined && cookie.split('.')[0] !== state)) throw Error('INVALID');
  return createHash('sha256').update(cookie).digest('hex');
}

export function steamOrigin(req, env = process.env) {
  const configured = env.STEAM_SITE_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + env.VERCEL_PROJECT_PRODUCTION_URL : '');
  const origin = configured || (env.NODE_ENV !== 'production' ? 'http://' + req.headers.host : '');
  const url = new URL(origin);
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local && env.NODE_ENV !== 'production'))) throw Error('CONFIG');
  return url.origin;
}

export function steamReturnTo(origin, state) {
  return origin + '/api/steam/callback?state=' + state;
}

export function steamLoginUrl(origin, state) {
  const url = new URL(STEAM_ENDPOINT);
  url.search = new URLSearchParams({ 'openid.ns': NS, 'openid.mode': 'checkid_setup', 'openid.return_to': steamReturnTo(origin, state), 'openid.realm': origin + '/', 'openid.identity': IDENTIFIER, 'openid.claimed_id': IDENTIFIER }).toString();
  return url.href;
}

// Verify locally before contacting the fixed Steam endpoint. Never fetch an asserted URL.
export async function verifySteamAssertion(query, returnTo, { fetcher = fetch, now = Date.now() } = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value !== 'string' || value.length > 4096) throw Error('INVALID');
    if (key.startsWith('openid.')) params.set(key, value);
  }
  const get = key => params.get('openid.' + key);
  const id = get('claimed_id');
  if (get('ns') !== NS || get('mode') !== 'id_res' || get('op_endpoint') !== STEAM_ENDPOINT || get('return_to') !== returnTo || get('identity') !== id || !/^https:\/\/steamcommunity\.com\/openid\/id\/7656119\d{10}$/.test(id || '')) throw Error('INVALID');
  const signed = (get('signed') || '').split(',');
  if (!['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce', 'assoc_handle'].every(key => signed.includes(key)) || !get('sig') || !get('assoc_handle')) throw Error('INVALID');
  const nonce = get('response_nonce') || '';
  const issued = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z.+$/.test(nonce) ? Date.parse(nonce.slice(0, 20)) : NaN;
  if (!Number.isFinite(issued) || now - issued > STEAM_TTL * 1000 || issued > now + 60000) throw Error('INVALID');
  params.set('openid.mode', 'check_authentication');
  const response = await fetcher(STEAM_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString(), redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Error('UNAVAILABLE');
  const body = await response.text();
  if (body.length > 8192 || !/^is_valid:true\r?$/m.test(body)) throw Error('INVALID');
  return id.split('/').pop();
}
