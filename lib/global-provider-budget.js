import { createClient } from '@supabase/supabase-js';

let database;
const providers = new Set([
  'tmdb',
  'rawg',
  'igdb',
  'twitch',
  'anilist',
  'fanart',
  'jikan',
  'steam',
]);

/**
 * Reserve one upstream call in a project-wide atomic Postgres budget.
 * Disabled until its migration and limits are reviewed. Once enabled, missing
 * configuration/database access fails closed instead of bypassing the budget.
 * @param {string} provider
 * @param {{client?: {rpc(name: string,args: Record<string,unknown>): PromiseLike<{data: unknown,error: unknown}>}, env?: Record<string,string|undefined>}} options
 * @returns {Promise<void>}
 */
export async function reserveGlobalBudget(provider, { client, env = process.env } = {}) {
  if (typeof window !== 'undefined') throw new Error('Server-only budget.');
  if (env.VOID_GLOBAL_BUDGETS_ENABLED !== '1') return;
  const scope = provider.toLowerCase();
  const prefix = `VOID_GLOBAL_${scope.toUpperCase()}`;
  const minute = Number(env[`${prefix}_MINUTE`]);
  const daily = Number(env[`${prefix}_DAILY`]);
  if (
    !providers.has(scope) ||
    !Number.isSafeInteger(minute) ||
    minute < 1 ||
    minute > 100000 ||
    !Number.isSafeInteger(daily) ||
    daily < 1 ||
    daily > 10000000
  )
    throw budgetError(503, 60);
  if (!client) {
    if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw budgetError(503, 60);
    database ||= createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(4000) }),
      },
    });
    client = database;
  }
  let result;
  if (!client) throw budgetError(503, 60);
  try {
    result = await client.rpc('void_reserve_provider_budget', {
      p_scope: scope,
      p_minute_limit: minute,
      p_daily_limit: daily,
    });
  } catch {
    throw budgetError(503, 60);
  }
  if (
    result.error ||
    typeof result.data !== 'number' ||
    !Number.isInteger(result.data) ||
    result.data < 0
  )
    throw budgetError(503, 60);
  if (result.data > 0) throw budgetError(429, result.data);
}

/** @param {number} status @param {number} retryAfter */
function budgetError(status, retryAfter) {
  return Object.assign(new Error('Serviço temporariamente indisponível'), {
    status,
    retryAfter,
    consumptionLimited: true,
  });
}
