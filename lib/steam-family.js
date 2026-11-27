// Server-side reader. Session credentials are used for this request only.
// Family names, other members and lender IDs never enter the import plan.
import {reserveGlobalBudget} from './global-provider-budget.js';
export function familyTokenIdentity(token, expectedSteamId, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 12000 || token.split('.').length !== 3) throw Error('STEAM_FAMILY_SESSION');
  let claims;
  try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); } catch { throw Error('STEAM_FAMILY_SESSION'); }
  if (!/^7656119[0-9]{10}$/.test(claims.sub || '') || !Number.isSafeInteger(claims.exp) || claims.exp * 1000 <= now) throw Error('STEAM_FAMILY_SESSION');
  if (claims.sub !== expectedSteamId) throw Error('STEAM_FAMILY_ACCOUNT');
  // This is a local preflight, not JWT authentication. Steam validates the
  // credential and the library response must identify this same account.
  return claims.sub;
}

export function playedFamilyGames(apps, now = Date.now()) {
  if (!Array.isArray(apps) || apps.length >= 20000) throw Error('STEAM_INCOMPLETE');
  return mergeSteamActivity(apps.flatMap(app => {
    if (!app || !Number.isSafeInteger(app.appid) || app.appid <= 0 || app.appid > 4294967295 || (app.app_type !== undefined && app.app_type !== 1)) return [];
    const minutes = Number.isSafeInteger(app.rt_playtime) && app.rt_playtime >= 0 && app.rt_playtime <= 2147483647 ? app.rt_playtime : null;
    const last = Number.isSafeInteger(app.rt_last_played) && app.rt_last_played > 0 && app.rt_last_played * 1000 <= now ? new Date(app.rt_last_played * 1000).toISOString() : null;
    if (!(minutes > 0) && !last) return [];
    return [{ appid: String(app.appid), title: String(app.name || `Steam App ${app.appid}`).slice(0, 250), minutes, last_played_at: last, evidence: minutes > 0 ? 'playtime' : 'last_played' }];
  }));
}

// Steam playtime is cumulative: duplicate owned/shared entries are merged,
// never added together. The existing activity table has the same Steam key.
export function mergeSteamActivity(...plans) {
  const result = new Map();
  for (const game of plans.flat()) {
    const previous = result.get(game.appid);
    if (!previous) { result.set(game.appid, { ...game }); continue; }
    const known = [previous.minutes, game.minutes].filter(Number.isSafeInteger);
    const minutes = known.length ? Math.max(...known) : null;
    const last = [previous.last_played_at, game.last_played_at].filter(Boolean).sort().at(-1) || null;
    result.set(game.appid, { ...previous, ...game, minutes, last_played_at: last, evidence: minutes > 0 ? 'playtime' : last ? 'last_played' : game.evidence });
  }
  if (result.size > 20000) throw Error('STEAM_INCOMPLETE');
  return [...result.values()];
}

export function createSteamFamilySource({ fetcher = fetch } = {}) {
  return { async played(token, expectedSteamId) {
    const steamid = familyTokenIdentity(token, expectedSteamId);
    async function request(method, params) {
      await reserveGlobalBudget('steam');
      const url = new URL(`https://api.steampowered.com/IFamilyGroupsService/${method}/v1/`);
      url.search = new URLSearchParams({ ...params, steamid, access_token: token }).toString();
      let response, payload;
      try { response = await fetcher(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000) }); }
      catch { throw Error('STEAM_UNAVAILABLE'); }
      if (!response.ok) throw Error(response.status === 429 ? 'STEAM_LIMIT' : [401, 403].includes(response.status) ? 'STEAM_FAMILY_SESSION' : 'STEAM_UNAVAILABLE');
      try { payload = (await response.json()).response; } catch { throw Error('STEAM_UNAVAILABLE'); }
      if (!payload || typeof payload !== 'object') throw Error('STEAM_INCOMPLETE');
      return payload;
    }
    const family = await request('GetFamilyGroupForUser', { include_family_group_response: 'false' });
    if (family.is_not_member_of_any_group || !/^[1-9][0-9]{0,19}$/.test(String(family.family_groupid || ''))) throw Error('STEAM_FAMILY_MISSING');
    const library = await request('GetSharedLibraryApps', { family_groupid: String(family.family_groupid), include_own: 'true', include_excluded: 'true', include_non_games: 'false', language: 'brazilian' });
    if (String(library.owner_steamid) !== steamid) throw Error('STEAM_FAMILY_ACCOUNT');
    return playedFamilyGames(library.apps);
  } };
}
