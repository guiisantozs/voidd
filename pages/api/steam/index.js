import { newSteamFlow, steamFlowHash, steamLoginUrl } from '../../../lib/steam-openid.js';
import { readSteamCookie, requireSteamOrigin, setSteamCookie, steamAction, steamActor, steamClients, steamFailure, steamHeaders } from '../../../lib/steam-server.js';

export function createSteamHandler(clients = steamClients) {
  return async function handler(req, res) {
    steamHeaders(res);
    if (!['GET', 'POST', 'DELETE'].includes(req.method)) { res.setHeader('Allow', 'GET, POST, DELETE'); return res.status(405).end(); }
    try {
      const origin = req.method === 'GET' ? null : requireSteamOrigin(req);
      const { auth, admin } = clients();
      const actor = await steamActor(req, auth);
      if (req.method === 'GET') {
        const { data, error } = await admin.from('void_steam_connections').select('steam_id,connected_at').eq('user_id', actor).maybeSingle();
        if (error) throw Error('UNAVAILABLE');
        return res.status(200).json({ connection: data });
      }
      if (req.method === 'DELETE') {
        await steamAction(admin, 'disconnect', actor);
        setSteamCookie(res, '', origin);
        return res.status(200).json({ connection: null });
      }
      if (req.body?.action === 'connect') {
        const flow = newSteamFlow();
        await steamAction(admin, 'start', actor, flow.hash);
        setSteamCookie(res, flow.cookie, origin);
        return res.status(200).json({ url: steamLoginUrl(origin, flow.state) });
      }
      if (req.body?.action === 'complete') {
        const hash = steamFlowHash(readSteamCookie(req));
        await steamAction(admin, 'complete', actor, hash);
        setSteamCookie(res, '', origin);
        return res.status(200).json({ connected: true });
      }
      throw Error('INVALID');
    } catch (error) { return steamFailure(res, error); }
  };
}

export default createSteamHandler();
