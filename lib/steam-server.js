import { createClient } from '@supabase/supabase-js';
import { STEAM_TTL, steamOrigin } from './steam-openid.js';

export function steamClients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const privateKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey || !privateKey) throw Error('CONFIG');
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input, init = {}) => fetch(input, { ...init, signal: AbortSignal.timeout(12000) }) } };
  return { auth: createClient(url, publicKey, options), admin: createClient(url, privateKey, options) };
}

export async function steamActor(req, client) {
  const authorization = req.headers.authorization || '';
  if (!/^Bearer [^\s]+$/.test(authorization)) throw Error('UNAUTHORIZED');
  const { data, error } = await client.auth.getUser(authorization.slice(7));
  if (error || !data.user || data.user.is_anonymous) throw Error('UNAUTHORIZED');
  return data.user.id;
}

export function readSteamCookie(req) {
  const matches = (req.headers.cookie || '').split(';').map(part => part.trim()).filter(part => part.startsWith('void_steam_flow='));
  return matches.length === 1 ? matches[0].slice('void_steam_flow='.length) : '';
}

export function setSteamCookie(res, value, origin) {
  res.setHeader('Set-Cookie', `void_steam_flow=${value}; Path=/api/steam; HttpOnly; SameSite=Lax; Max-Age=${value ? STEAM_TTL : 0}${origin.startsWith('https:') ? '; Secure' : ''}`);
}

export function steamHeaders(res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Authorization, Cookie');
}

export function requireSteamOrigin(req) {
  const origin = steamOrigin(req);
  if (req.headers.origin !== origin) throw Error('FORBIDDEN');
  return origin;
}

export async function steamAction(admin, action, actor, hash = null) {
  const { error } = await admin.rpc('void_steam_connection_action', { p_action: action, p_user_id: actor, p_hash: hash });
  if (error) {
    if (error.code === '23505' || error.message?.includes('ALREADY_CONNECTED')) throw Error('CONFLICT');
    if (error.message?.includes('RATE_LIMIT')) throw Error('RATE_LIMIT');
    if (error.message?.includes('INVALID_FLOW')) throw Error('INVALID');
    throw Error('UNAVAILABLE');
  }
}

export function steamFailure(res, error) {
  const failures = {
    CONFIG: [503, 'A conexão com a Steam ainda não está configurada neste ambiente.'],
    UNAUTHORIZED: [401, 'Entre novamente no VOID para conectar sua Steam.'],
    FORBIDDEN: [403, 'Abra a conexão pela página da sua conta.'],
    INVALID: [400, 'A conexão expirou ou não pôde ser validada. Tente conectar novamente.'],
    CONFLICT: [409, 'Esta conta já possui uma conexão Steam ou a Steam já está vinculada a outra conta.'],
    RATE_LIMIT: [429, 'Aguarde alguns segundos antes de conectar novamente.'],
  };
  const [status, message] = failures[error.message] || [503, 'A conexão com a Steam está indisponível neste momento. Tente novamente mais tarde.'];
  return res.status(status).json({ message });
}
