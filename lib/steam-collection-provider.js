import { playedSteamGames, steamAppId } from './game-collection.js';
import {useIGDBCatalog} from './game-provider.js';
import {legacySteamLinks} from '../config/game-provider-links.js';
import {reserveGlobalBudget} from './global-provider-budget.js';

const cache = new Map();
export function createSteamProvider({ key = process.env.STEAM_WEB_API_KEY, rawgKey = useIGDBCatalog() ? undefined : process.env.RAWG_API_KEY, fetcher = fetch } = {}) {
  key = typeof key === 'string' ? key.trim() : '';
  if (!key || key === 'cole_sua_chave_aqui') throw Error('STEAM_KEY_REQUIRED');
  async function request(url) {
    await reserveGlobalBudget(new URL(url).hostname==='api.rawg.io'?'rawg':'steam');
    let response;
    try { response = await fetcher(url, { signal: AbortSignal.timeout(7000), redirect: 'error' }); } catch { throw Error('STEAM_UNAVAILABLE'); }
    if (!response.ok) throw Error(response.status === 429 ? 'STEAM_LIMIT' : response.status === 401 || response.status === 403 ? 'STEAM_ACCESS' : 'STEAM_UNAVAILABLE');
    try { return await response.json(); } catch { throw Error('STEAM_UNAVAILABLE'); }
  }
  function api(path, params) { const url = new URL('https://api.steampowered.com/' + path); url.search = new URLSearchParams({ key, ...params }).toString(); return request(url); }
  async function cached(cacheKey, load) {
    if (cache.get(cacheKey)?.expires > Date.now()) return cache.get(cacheKey).data;
    const data = await load(); if (cache.size > 3000) cache.delete(cache.keys().next().value);
    cache.set(cacheKey, { data, expires: Date.now() + 86400000 }); return data;
  }
  async function mapRawg(game) {
    const known=legacySteamLinks.find(link=>link.steam_id===String(game.appid));
    if(known)return known.rawg_id;
    if (!rawgKey || rawgKey === 'cole_sua_chave_aqui') return null;
    try {
      return await cached('rawg:' + game.appid, async () => {
        const search = new URL('https://api.rawg.io/api/games'); search.search = new URLSearchParams({ key: rawgKey, search: game.title, search_exact: 'true', page_size: '3' }).toString();
        const found = await request(search);
        const matches = await Promise.all((found.results || []).slice(0, 3).map(async candidate => {
          const stores = await request(`https://api.rawg.io/api/games/${candidate.id}/stores?key=${encodeURIComponent(rawgKey)}`);
          return stores.results?.some(store => steamAppId(store.url) === game.appid) ? candidate.id : null;
        }));
        const ids = [...new Set(matches.filter(Boolean))];
        return ids.length === 1 ? ids[0] : null;
      });
    } catch { return null; }
  }
  const provider = {
    async played(steamId) {
      const owned = await api('IPlayerService/GetOwnedGames/v1/', { steamid: steamId, include_appinfo: 'true', include_played_free_games: 'true' });
      let recent = [];
      try { recent = (await api('IPlayerService/GetRecentlyPlayedGames/v1/', { steamid: steamId, count: '0' })).response?.games || []; } catch { /* Existing history is preserved when the recent supplement fails. */ }
      return playedSteamGames(owned.response, recent);
    },
    async recover(appid, steamId) {
      const played = await provider.played(steamId);
      const observed = played.find(game => game.appid === appid);
      const game = await provider.enrich(observed || { appid, title: `Steam App ${appid}`, minutes: null, last_played_at: null, evidence: 'achievement' }, steamId);
      if (game.excluded) throw Error('STEAM_NOT_GAME');
      if (!observed && !(game.achievement_unlocked > 0)) throw Error('STEAM_ACTIVITY_UNCONFIRMED');
      return game;
    },
    async enrich(game, steamId, existing = null) {
      // These requests contain public catalogue data; only public metadata is cached.
      const [storeResult, schemaResult, progressResult, rarityResult, rawgId] = await Promise.allSettled([
        cached('store:' + game.appid, () => request(`https://store.steampowered.com/api/appdetails?appids=${game.appid}&l=brazilian`)),
        cached('schema:' + game.appid, () => api('ISteamUserStats/GetSchemaForGame/v2/', { appid: game.appid, l: 'brazilian' })),
        api('ISteamUserStats/GetPlayerAchievements/v1/', { appid: game.appid, steamid: steamId, l: 'brazilian' }),
        cached('rarity:' + game.appid, () => api('ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/', { gameid: game.appid })),
        existing?.rawg_id ? Promise.resolve(existing.rawg_id) : mapRawg(game),
      ]);
      const store = storeResult.status === 'fulfilled' ? storeResult.value[game.appid]?.data : null;
      if (store?.type && store.type !== 'game') return { ...game, excluded: true, app_type: store.type };
      const schema = schemaResult.status === 'fulfilled' ? schemaResult.value.game?.availableGameStats?.achievements : null;
      const player = progressResult.status === 'fulfilled' && progressResult.value.playerstats?.success === true ? progressResult.value.playerstats.achievements : null;
      const rarity = rarityResult.status === 'fulfilled' ? rarityResult.value.achievementpercentages?.achievements || [] : [];
      let definitions = null, achievements = null, total = null, unlocked = null, status = 'unavailable';
      if (Array.isArray(schema)) {
        definitions = schema.map(row => ({ key: row.name, title: row.displayName || row.name, description: row.description || '', icon: safeSteamImage(row.icon), locked_icon: safeSteamImage(row.icongray), hidden: Number(row.hidden) === 1,
          global_percent: validPercent(rarity.find(percent => percent.name === row.name)?.percent) }));
        if (schema.length === 0) { total = 0; unlocked = 0; achievements = []; status = 'none'; }
        else if (Array.isArray(player) && schema.every(def => player.some(row => row.apiname === def.name && [0, 1].includes(row.achieved)))) {
          achievements = schema.map(def => { const row = player.find(value => value.apiname === def.name); return { key: def.name, unlocked: row.achieved === 1, unlocked_at: row.achieved === 1 && row.unlocktime > 0 && row.unlocktime * 1000 <= Date.now() ? new Date(row.unlocktime * 1000).toISOString() : null }; });
          total = schema.length; unlocked = achievements.filter(row => row.unlocked).length; status = 'available';
        }
      }
      if (status === 'unavailable' && game.evidence === 'achievement' && game.achievement_unlocked > 0) {
        total = game.achievement_total; unlocked = game.achievement_unlocked;
      }
      return { ...game, title: store?.name || game.title, rawg_id: rawgId.status === 'fulfilled' ? rawgId.value : null,
        cover_url: safeSteamImage(store?.header_image) || `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`, app_type: store?.type || 'unknown', definitions, achievements, achievement_total: total, achievement_unlocked: unlocked, achievement_status: status };
    },
  };
  return provider;
}
function validPercent(value) { const number = value === undefined || value === null ? NaN : Number(value); return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null; }
export function safeSteamImage(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && /(?:^|\.)(?:steamstatic\.com|steamcdn-a\.akamaihd\.net|steamusercontent\.com)$/.test(url.hostname) ? url.href : null; } catch { return null; }
}
