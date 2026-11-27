import { createClient } from '@supabase/supabase-js';
import { createSteamProvider } from './steam-collection-provider.js';
import { achievementSpotlights, collectionStats, groupCollection } from './game-collection.js';
import { createSteamFamilySource, mergeSteamActivity } from './steam-family.js';

export const collectionErrors = {
 STEAM_KEY_REQUIRED: [503, 'Sua Steam está conectada. A sincronização está indisponível por uma configuração do VOID; você não precisa gerar nenhuma chave. Tente novamente mais tarde.'],
 STEAM_PRIVATE: [409, 'A Steam não disponibilizou sua biblioteca. Confira a privacidade de Detalhes dos jogos na Steam. Os dados anteriores foram preservados.'],
 STEAM_INCOMPLETE: [502, 'A Steam retornou uma biblioteca incompleta. Os dados anteriores foram preservados.'],
 STEAM_ACTIVITY_UNCONFIRMED: [409, 'A Steam não disponibilizou tempo jogado, última atividade ou conquistas desbloqueadas para este jogo na sua conta. Confira os Detalhes dos jogos na Steam. Não adicionamos atividade sem confirmação.'],
 STEAM_NOT_GAME: [409, 'Este aplicativo da Steam não é um jogo.'],
 STEAM_FAMILY_SESSION: [409, 'A autorização da Steam está inválida ou expirou. Abra a Steam novamente e copie uma nova autorização.'],
 STEAM_FAMILY_ACCOUNT: [409, 'Entre na mesma conta Steam que você conectou ao VOID. A autorização recebida pertence a outra conta ou a Steam não confirmou de quem é a atividade.'],
 STEAM_FAMILY_MISSING: [409, 'Esta conta não participa de uma família Steam disponível para consulta.'],
 STEAM_ACCESS: [502, 'A Steam recusou a consulta do VOID. Sua conta continua conectada; tente sincronizar novamente mais tarde.'],
 STEAM_LIMIT: [429, 'Limite de consultas da Steam atingido. Aguarde antes de retomar.'],
 SYNC_BUSY: [409, 'Uma sincronização já está em andamento. Aguarde um minuto para retomar.'],
 SYNC_COOLDOWN: [429, 'Aguarde um minuto entre sincronizações. Cada conta pode iniciar até 12 importações por dia.'],
 NOT_CONNECTED: [409, 'Conecte sua Steam em Contas conectadas para sincronizar.'],
 SOURCE_CHANGED: [409, 'Existem dados de outra conta Steam. Exclua os dados importados antes de sincronizar esta nova conta.'],
 COLLECTION_PRIVATE: [403, 'Esta coleção é privada ou não está disponível para você.'],
 UNAUTHORIZED: [401, 'Entre novamente no VOID para continuar.'],
 FORBIDDEN: [403, 'Abra esta ação pelo VOID.'],
 INVALID: [400, 'Solicitação inválida.'],
};
export function collectionFailure(res, error) {
 if(error?.consumptionLimited){res.setHeader('Cache-Control','private, no-store');res.setHeader('Retry-After',String(error.retryAfter||60));return res.status(error.status===429?429:503).json({code:'STEAM_LIMIT',message:'Limite temporário de consultas. Tente novamente mais tarde.'});}
 const code = Object.hasOwn(collectionErrors, error.message) ? error.message : 'COLLECTION_UNAVAILABLE';
 const [status, message] = collectionErrors[code] || [502, 'Não foi possível atualizar a coleção. Os dados anteriores foram preservados; tente retomar a sincronização.'];
 return res.status(status).json({ code, message });
}
async function rpc(admin, name, args) {
 const { data, error } = await admin.rpc(name, args);
 if (error) throw Error(Object.keys(collectionErrors).find(key => error.message?.includes(key)) || 'COLLECTION_UNAVAILABLE');
 return data;
}
export async function syncCollectionBatch(admin, actor, { providerFactory = createSteamProvider, familyFactory = createSteamFamilySource, familyToken = null } = {}) {
 const provider = providerFactory(); // No job is created when configuration is missing.
 let run = await rpc(admin, 'void_collection_claim', { p_user: actor });
 if (run && familyToken !== null) {
  await admin.rpc('void_collection_release', { p_user: actor, p_run: run.id, p_lease: run.lease, p_error: 'SYNC_BUSY' });
  throw Error('SYNC_BUSY');
 }
 if (!run) {
  const { data: account, error } = await admin.from('void_steam_connections').select('steam_id,connected_at').eq('user_id', actor).maybeSingle();
  if (error) throw Error('COLLECTION_UNAVAILABLE');
  if (!account) throw Error('NOT_CONNECTED');
  const importingFamily = familyToken !== null;
  const fresh = !importingFamily ? await provider.played(account.steam_id) : mergeSteamActivity(...await Promise.all([
   provider.played(account.steam_id), familyFactory().played(familyToken, account.steam_id),
  ]));
  familyToken = null; // Only normalized activity, never a credential, is persisted.
  // Keep previously verified shared/removed games in ordinary syncs as well,
  // so achievements can refresh without asking for the family session again.
  const previous = await allRows(() => admin.from('void_game_activity').select('external_id,playtime_minutes,last_played_at,evidence,achievement_total,achievement_unlocked,platform_game:void_game_platform_ids!inner(game:void_collection_games(title))')
   .eq('user_id', actor).eq('provider', 'steam').eq('source_account', account.steam_id).order('external_id'));
  const plan = mergeSteamActivity(previous.map(row => ({ appid: row.external_id, title: row.platform_game?.game?.title || `Steam App ${row.external_id}`, minutes: row.playtime_minutes, last_played_at: row.last_played_at, evidence: row.evidence, achievement_total: row.achievement_total, achievement_unlocked: row.achievement_unlocked })), fresh);
  run = await rpc(admin, 'void_collection_claim', { p_user: actor, p_plan: plan, p_expected_account: account.steam_id, p_expected_connection: account.connected_at });
  if (importingFamily && (run.position !== 0 || run.plan.length !== plan.length || run.plan.some((game, index) =>
   game.appid !== plan[index].appid || game.minutes !== plan[index].minutes || (game.last_played_at || null) !== (plan[index].last_played_at || null) || game.evidence !== plan[index].evidence))) {
   await admin.rpc('void_collection_release', { p_user: actor, p_run: run.id, p_lease: run.lease, p_error: 'SYNC_BUSY' });
   throw Error('SYNC_BUSY');
  }
 }
 try {
  const batch = run.plan.slice(run.position, run.position + 2);
  const games = await Promise.all(batch.map(async game => {
   const cached = await admin.from('void_game_platform_ids').select('game:void_collection_games(rawg_id)').eq('provider', 'steam').eq('external_id', game.appid).maybeSingle();
   if (cached.error) throw Error('COLLECTION_UNAVAILABLE');
   return provider.enrich(game, run.source_account, cached.data?.game);
  }));
  return await rpc(admin, 'void_collection_commit', { p_user: actor, p_run: run.id, p_lease: run.lease, p_games: games.filter(Boolean), p_count: batch.length });
 } catch (error) {
  await admin.rpc('void_collection_release', { p_user: actor, p_run: run.id, p_lease: run.lease, p_error: Object.keys(collectionErrors).includes(error.message) ? error.message : 'PROVIDER_UNAVAILABLE' });
  throw error;
 }
}

// A shared/removed licence may be absent from OwnedGames. The AppID is only a
// search hint: the provider must confirm activity for the server-linked account.
export async function recoverCollectionGame(admin, actor, appid, { providerFactory = createSteamProvider } = {}) {
 if (typeof appid !== 'string' || !/^[1-9][0-9]{0,9}$/.test(appid) || Number(appid) > 4294967295) throw Error('INVALID');
 const provider = providerFactory();
 let run = await rpc(admin, 'void_collection_claim', { p_user: actor });
 if (run) {
  await admin.rpc('void_collection_release', { p_user: actor, p_run: run.id, p_lease: run.lease, p_error: 'SYNC_BUSY' });
  throw Error('SYNC_BUSY');
 }
 const { data: account, error } = await admin.from('void_steam_connections').select('steam_id,connected_at').eq('user_id', actor).maybeSingle();
 if (error) throw Error('COLLECTION_UNAVAILABLE');
 if (!account) throw Error('NOT_CONNECTED');
 const game = await provider.recover(appid, account.steam_id);
 run = await rpc(admin, 'void_collection_claim', { p_user: actor, p_plan: [game], p_expected_account: account.steam_id, p_expected_connection: account.connected_at });
 try {
  // Another tab may have started a run while Steam was responding.
  if (run.plan.length !== 1 || run.position !== 0 || run.plan[0].appid !== appid || run.source_account !== account.steam_id || run.plan[0].evidence !== game.evidence) throw Error('SYNC_BUSY');
  return await rpc(admin, 'void_collection_commit', { p_user: actor, p_run: run.id, p_lease: run.lease, p_games: [game], p_count: 1 });
 } catch (error) {
  await admin.rpc('void_collection_release', { p_user: actor, p_run: run.id, p_lease: run.lease, p_error: Object.hasOwn(collectionErrors, error.message) ? error.message : 'PROVIDER_UNAVAILABLE' });
  throw error;
 }
}

export function collectionReader(token) {
 const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if (!url || !key) throw Error('COLLECTION_UNAVAILABLE');
 return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { headers: token ? { Authorization: 'Bearer ' + token } : {}, fetch: (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(12000) }) } });
}
async function allRows(build) {
 const rows = [];
 for (let offset = 0; offset <= 20000; offset += 500) {
  const { data, error } = await build().range(offset, offset + 499);
  if (error || !data) throw Error('COLLECTION_UNAVAILABLE');
  rows.push(...data); if (data.length < 500) return rows;
 }
 throw Error('COLLECTION_UNAVAILABLE');
}
export async function readCollection(client, target, owner, { game = null, rawg = null, spotlights = false } = {}) {
 const { data: access, error: denied } = await client.rpc('void_collection_access', { target });
 if (denied) throw Error('COLLECTION_UNAVAILABLE');
 if (!access) throw Error('COLLECTION_PRIVATE');
 const detailed = !!(game || rawg || spotlights);
 let canonical = game;
 if (rawg) {
  const result = await client.from('void_collection_games').select('id').eq('rawg_id', rawg).maybeSingle();
  if (result.error) throw Error('COLLECTION_UNAVAILABLE');
  canonical = result.data?.id || '00000000-0000-0000-0000-000000000000';
 }
 const select = 'user_id,provider,external_id,playtime_minutes,last_played_at,achievement_total,achievement_unlocked,achievement_status,synced_at,' + (detailed ? 'achievements,' : '') + 'platform_game:void_game_platform_ids!inner(game_id,app_type,' + (detailed ? 'definitions,' : '') + 'game:void_collection_games(*))';
 const rows = await allRows(() => {
  let query = client.from('void_game_activity').select(select).eq('user_id', target).order('provider').order('external_id');
  if (canonical) query = query.eq('platform_game.game_id', canonical);
  return query;
 });
 const [count, highlights, preferences, account, lastSync, identity] = await Promise.all([
  client.rpc('void_collection_connection_count', { target }),
  client.from('void_collection_highlights').select('*').eq('user_id', target).order('slot'),
  client.from('void_collection_preferences').select('visibility,gamer_banner,favorite_game').eq('user_id', target).maybeSingle(),
  owner ? client.from('void_steam_connections').select('connected_at').eq('user_id', target).maybeSingle() : Promise.resolve({ data: null }),
  owner ? client.from('void_game_sync_runs').select('state,position,imported,warnings,started_at,finished_at,last_error').eq('user_id', target).eq('state', 'completed').order('finished_at', { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
  client.from('void_community_profiles').select('user_id,display_name,username,avatar_url,avatar_id,visibility').eq('user_id',target).maybeSingle(),
 ]);
 if ([count, highlights, preferences, account, lastSync, identity].some(result => result.error)) throw Error('COLLECTION_UNAVAILABLE');
 const spotlight = spotlights ? achievementSpotlights(rows) : null;
 const visibleRows = spotlights ? rows.map(({ achievements, platform_game, ...row }) => { const { definitions, ...platform } = platform_game; return { ...row, platform_game: platform }; }) : rows;
 return { rows: visibleRows, games: groupCollection(visibleRows), stats: collectionStats(visibleRows, count.data), spotlights: spotlight, highlights: highlights.data || [], visibility: preferences.data?.visibility || 'public', appearance:{banner:preferences.data?.gamer_banner||null,favorite:preferences.data?.favorite_game||null},profile:identity.data,connected: !!account.data, lastSync: lastSync.data, owner };
}
