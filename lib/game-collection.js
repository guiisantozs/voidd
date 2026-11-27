export const collectionProviders = [
  { key: 'steam', label: 'Steam', icon: '/images/platforms/steam.png', available: true },
  { key: 'playstation', label: 'PlayStation', icon: '/images/platforms/playstation.png', available: false },
  { key: 'xbox', label: 'Xbox', icon: '/images/platforms/xbox.png', available: false },
];
export function playedSteamGames(owned, recent = [], now = Date.now()) {
  if (!owned || !Number.isInteger(owned.game_count) || owned.game_count < 0 || (owned.game_count > 0 && !Array.isArray(owned.games))) throw Error('STEAM_PRIVATE');
  if (Array.isArray(owned.games) && owned.games.length !== owned.game_count) throw Error('STEAM_INCOMPLETE');
  const games = new Map();
  for (const game of [...(owned.games || []), ...recent]) {
    if (!Number.isSafeInteger(game.appid) || game.appid <= 0) continue;
    const prior = games.get(game.appid);
    games.set(game.appid, { ...prior, ...game, playtime_forever: Math.max(prior?.playtime_forever || 0, game.playtime_forever || 0), rtime_last_played: Math.max(prior?.rtime_last_played || 0, game.rtime_last_played || 0) });
  }
  return [...games.values()].flatMap(game => {
    const minutes = Number.isSafeInteger(game.playtime_forever) && game.playtime_forever >= 0 && game.playtime_forever <= 2147483647 ? game.playtime_forever : null;
    const timestamp = Number.isSafeInteger(game.rtime_last_played) && game.rtime_last_played > 0 && game.rtime_last_played * 1000 <= now ? game.rtime_last_played : null;
    if (!(minutes > 0) && !timestamp) return [];
    return [{ appid: String(game.appid), title: String(game.name || `Steam App ${game.appid}`).slice(0, 250), minutes, last_played_at: timestamp ? new Date(timestamp * 1000).toISOString() : null, evidence: minutes > 0 ? 'playtime' : 'last_played' }];
  });
}
export function steamAppId(url) {
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && parsed.hostname === 'store.steampowered.com' ? parsed.pathname.match(/^\/app\/([1-9][0-9]*)(?:\/|$)/)?.[1] || null : null; } catch { return null; }
}
export function steamGameInput(value) {
  const input = typeof value === 'string' ? value.trim() : '';
  const appid = /^[1-9][0-9]{0,9}$/.test(input) ? input : steamAppId(input);
  return appid && Number(appid) <= 4294967295 ? appid : null;
}
export function achievementPercent(row) {
  return Number.isInteger(row.achievement_total) && row.achievement_total > 0 && Number.isInteger(row.achievement_unlocked) ? Math.round(row.achievement_unlocked / row.achievement_total * 100) : null;
}
export function groupCollection(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const game = row.platform_game?.game;
    if (!game) continue;
    if (!groups.has(game.id)) groups.set(game.id, { ...game, platforms: [], minutes: null, last_played_at: null, percentage: null });
    const group = groups.get(game.id);
    group.platforms.push(row);
    if (row.playtime_minutes !== null) group.minutes = (group.minutes ?? 0) + row.playtime_minutes;
    if (row.last_played_at && (!group.last_played_at || row.last_played_at > group.last_played_at)) group.last_played_at = row.last_played_at;
    const percentage = achievementPercent(row);
    if (percentage !== null) group.percentage = Math.max(group.percentage ?? 0, percentage);
  }
  return [...groups.values()];
}
export function collectionStats(rows, connected = null) {
  const games = groupCollection(rows);
  const known = rows.filter(row => row.achievement_total !== null && row.achievement_unlocked !== null);
  return { games: games.length, connected, minutes: rows.some(row => row.playtime_minutes !== null) ? rows.reduce((sum, row) => sum + (row.playtime_minutes ?? 0), 0) : null,
    completed: known.length ? new Set(known.filter(row => row.achievement_total > 0 && row.achievement_unlocked === row.achievement_total).map(row => row.platform_game.game.id)).size : null,
    unlocked: known.some(row => row.provider === 'steam') ? known.filter(row => row.provider === 'steam').reduce((sum, row) => sum + row.achievement_unlocked, 0) : null,
    unknownAchievements: rows.length - known.length };
}
export function collectionHours(minutes) { return minutes === null || minutes === undefined ? 'Indisponível' : `${(minutes / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`; }
export function achievementSpotlights(rows) {
  const unlocked = rows.flatMap(row => (row.achievements || []).filter(a => a.unlocked).map(a => {
    const definition = row.platform_game?.definitions?.find(def => def.key === a.key);
    return definition ? { ...definition, unlocked_at: a.unlocked_at, provider: row.provider, external_id: row.external_id, game: row.platform_game.game.title, game_id: row.platform_game.game.id } : null;
  }).filter(Boolean));
  return { recent: unlocked.filter(a => a.unlocked_at).sort((a, b) => b.unlocked_at.localeCompare(a.unlocked_at)).slice(0, 12),
    rare: unlocked.filter(a => a.provider === 'steam' && typeof a.global_percent === 'number' && a.global_percent >= 0 && a.global_percent <= 10).sort((a, b) => a.global_percent - b.global_percent).slice(0, 12) };
}
export function collectionGameHref(game) { return game.rawg_id ? `/obra/jogos/${game.rawg_id}#meu-historico` : `/jogos/colecao/${game.id}`; }
export function filterCollection(games, query, provider, order) {
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return games.filter(game => normalize(game.title).includes(normalize(query.trim())) && (provider === 'all' || game.platforms.some(row => row.provider === provider))).sort((a, b) => order === 'minutes' ? (b.minutes ?? -1) - (a.minutes ?? -1) : order === 'recent' ? (b.last_played_at || '').localeCompare(a.last_played_at || '') : order === 'achievements' ? (b.percentage ?? -1) - (a.percentage ?? -1) : a.title.localeCompare(b.title, 'pt-BR'));
}
