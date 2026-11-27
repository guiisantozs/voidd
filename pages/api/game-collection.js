import { collectionFailure, collectionReader, readCollection, syncCollectionBatch, recoverCollectionGame } from '../../lib/game-collection-server.js';
import { requireSteamOrigin, steamActor, steamClients, steamHeaders } from '../../lib/steam-server.js';
import { resolveGamerAppearance } from '../../lib/gamer-profile-server.js';

const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export const config = { maxDuration: 60, api: { bodyParser: { sizeLimit: '16kb' } } };
export default async function handler(req, res) {
 steamHeaders(res);
 if (!['GET', 'POST', 'DELETE', 'PATCH'].includes(req.method)) { res.setHeader('Allow', 'GET, POST, DELETE, PATCH'); return res.status(405).end(); }
 try {
  const token = req.headers.authorization?.match(/^Bearer ([^\s]+)$/)?.[1];
  const client = collectionReader(token);
  let actor = null;
  if (token) actor = await steamActor(req, client);
  if (req.method === 'GET') {
   if (!req.query.target && !actor) throw Error('UNAUTHORIZED');
   const target = req.query.target || actor;
   if (!uuid(target) || (req.query.game && !uuid(req.query.game)) || (req.query.rawg && (typeof req.query.rawg !== 'string' || !/^[1-9][0-9]{0,9}$/.test(req.query.rawg)))) throw Error('INVALID');
   return res.status(200).json(await readCollection(client, target, actor === target, { game: req.query.game, rawg: req.query.rawg, spotlights: req.query.achievements === '1' }));
  }
  if (!actor) throw Error('UNAUTHORIZED');
  requireSteamOrigin(req);
  if (req.method === 'PATCH') {
   if(req.body?.action==='appearance') {
    const field=req.body.field;
    const value=await resolveGamerAppearance(client,actor,field,req.body.selection);
    const {admin}=steamClients();
    const {error}=await admin.from('void_collection_preferences').upsert({user_id:actor,[field==='banner'?'gamer_banner':'favorite_game']:value});
    if(error)throw Error('COLLECTION_UNAVAILABLE');
    return res.status(200).json({field,value});
   }
   if (!['private', 'public'].includes(req.body?.visibility)) throw Error('INVALID');
   const { error } = await client.from('void_collection_preferences').upsert({ user_id: actor, visibility: req.body.visibility });
   if (error) throw Error('COLLECTION_UNAVAILABLE');
   return res.status(200).json({ updated: true });
  }
  if (req.method === 'POST' && req.body?.action === 'feature') {
   const { slot, provider = null, external_id = null, key = null } = req.body;
   if (!Number.isInteger(slot) || slot < 1 || slot > 3 || (key !== null && (provider !== 'steam' || !/^[1-9][0-9]*$/.test(external_id) || typeof key !== 'string' || key.length > 250))) throw Error('INVALID');
   const { error } = await client.rpc('void_collection_feature', { p_slot: slot, p_provider: provider, p_external_id: external_id, p_key: key });
   if (error) throw Error('INVALID');
   return res.status(200).json({ updated: true });
  }
  const { admin } = steamClients();
  if (req.method === 'DELETE') {
   if (req.body?.confirm !== 'delete-imported') throw Error('INVALID');
   const { error } = await admin.rpc('void_collection_forget', { p_user: actor });
   if (error) throw Error('COLLECTION_UNAVAILABLE');
   return res.status(200).json({ deleted: true });
  }
  if (req.body?.action === 'recover') return res.status(200).json(await recoverCollectionGame(admin, actor, req.body.appid));
  if (req.body?.action === 'sync-family') {
   if (typeof req.body.familyToken !== 'string' || !req.body.familyToken.trim() || req.body.familyToken.length > 12000) throw Error('STEAM_FAMILY_SESSION');
   return res.status(200).json(await syncCollectionBatch(admin, actor, { familyToken: req.body.familyToken.trim() }));
  }
  if (req.body?.action !== 'sync') throw Error('INVALID');
  return res.status(200).json(await syncCollectionBatch(admin, actor));
 } catch (error) { return collectionFailure(res, error); }
}
