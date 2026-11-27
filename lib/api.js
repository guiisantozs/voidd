import {resourceMetrics,logResourceMetrics} from './resource-metrics.js';
import {createProviderGuard,retryAfterSeconds} from './provider-guard.js';
import {consumptionFailure} from './catalog-consumption.js';
import {reserveGlobalBudget} from './global-provider-budget.js';

const guards=new Map();
function providerGuard(provider) {
  if (!guards.has(provider)) {
    const value=(suffix,fallback)=>{const n=Number(process.env[`VOID_${provider}_${suffix}`]);return Number.isInteger(n)&&n>0?n:fallback;};
    guards.set(provider,createProviderGuard({concurrency:value('CONCURRENCY',6),minuteBudget:value('MINUTE_BUDGET',0),dailyBudget:value('DAILY_BUDGET',0),record:event=>resourceMetrics.record(provider+':guard',event)}));
  }
  return guards.get(provider);
}

export async function fetchJson(url) {
  const target=new URL(url),provider=({'api.themoviedb.org':'TMDB','api.rawg.io':'RAWG'})[target.hostname];
  const load=()=>fetchJsonUnshared(url,provider,target);
  // Only public catalogue GETs use this helper. Do not add authenticated APIs.
  const data=await (provider?providerGuard(provider).run(target.href,load):load());
  return provider?structuredClone(data):data;
}
async function fetchJsonUnshared(url,provider,target) {
  const label=provider?provider+':'+target.pathname.replace(/\/[0-9]+(?=\/|$)/g,'/:id'):'external:other';
  const started=Date.now();
  try {
    if (provider) await reserveGlobalBudget(provider);
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      if(response.status===429)resourceMetrics.record(label,'limited');
      const error = new Error('Serviço indisponível');
      error.status = response.status;
      const retry=response.headers?.get('retry-after');
      if (response.status===429 || (response.status===503 && retry)) error.retryAfter=retryAfterSeconds(retry);
      throw error;
    }
    return await response.json();
  }catch(error){resourceMetrics.record(label,'errors');throw error;}
  finally{
    resourceMetrics.record(label,'requests',Date.now()-started);logResourceMetrics();
  }
}

export function catalogHandler(key, load) {
  return async (req, res) => {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ erro: 'Método não permitido.' });
    }
    try {
      const items = await load();
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
      return res.status(200).json({ [key]: items });
    } catch (error) {
      const configuration = error.message === 'CONFIG';
      return res.status(consumptionFailure(error,res) || (configuration ? 503 : 502)).json({
        erro: configuration ? 'Catálogo não configurado. Consulte as variáveis de ambiente no README.' : 'Não foi possível consultar o catálogo. Tente novamente.',
      });
    }
  };
}

export async function tmdb(path, type) {
  const key = process.env.TMDB_API_KEY;
  if (!key || key === 'cole_sua_chave_aqui') throw new Error('CONFIG');
  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  url.searchParams.set('api_key', key);
  url.searchParams.set('language', 'pt-BR');
  if (type === 'anime') {
    url.searchParams.set('with_genres', '16');
    url.searchParams.set('with_origin_country', 'JP');
    url.searchParams.set('vote_count.gte', '100');
  }
  const data = await fetchJson(url);
  return (data.results || []).filter(item => !item.adult).map(item => ({
    id: item.id, titulo: item.title || item.name,
    tmdbRating: item.vote_average ?? null, tmdbVoteCount: item.vote_count ?? 0,
    nota: item.vote_count > 0 ? item.vote_average / 2 : null,
    poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
    backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
    sinopse: item.overview || '', ano: (item.release_date || item.first_air_date || '').slice(0, 4),
  }));
}
