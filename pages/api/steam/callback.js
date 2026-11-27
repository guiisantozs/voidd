import { steamFlowHash, steamOrigin, steamReturnTo, verifySteamAssertion } from '../../../lib/steam-openid.js';
import { readSteamCookie, setSteamCookie, steamClients, steamHeaders } from '../../../lib/steam-server.js';

export function createSteamCallback(clients = steamClients, verify = verifySteamAssertion) {
  return async function handler(req, res) {
    steamHeaders(res);
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
    let origin;
    try {
      origin = steamOrigin(req);
      const state = req.query.state;
      if (typeof state !== 'string') throw Error('INVALID');
      const hash = steamFlowHash(readSteamCookie(req), state);
      if (req.query['openid.mode'] === 'cancel') {
        setSteamCookie(res, '', origin);
        return res.redirect(303, origin + '/conta?steam=cancelled');
      }
      const { admin } = clients();
      const { data, error } = await admin.from('void_steam_challenges').select('expires_at').eq('token_hash', hash).is('steam_id', null).maybeSingle();
      if (error || !data || Date.parse(data.expires_at) <= Date.now()) throw Error('INVALID');
      const steamId = await verify(req.query, steamReturnTo(origin, state));
      const saved = await admin.from('void_steam_challenges').update({ steam_id: steamId }).eq('token_hash', hash).is('steam_id', null).gt('expires_at', new Date().toISOString()).select('token_hash');
      if (saved.error || saved.data?.length !== 1) throw Error('INVALID');
      // The browser must return with a live VOID session for the same account before linking.
      return res.redirect(303, origin + '/conta?steam=complete');
    } catch {
      if (origin) setSteamCookie(res, '', origin);
      return res.redirect(303, (origin || '') + '/conta?steam=error');
    }
  };
}

export default createSteamCallback();
