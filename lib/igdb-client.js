// Server-only transport shared by covers and structured universe metadata.
import {resourceMetrics,logResourceMetrics} from './resource-metrics.js';
import {createProviderGuard,consumptionError} from './provider-guard.js';
import {reserveGlobalBudget} from './global-provider-budget.js';
export function createIGDBClient({ fetcher = fetch, credentials = () => ({ id: process.env.IGDB_CLIENT_ID, secret: process.env.IGDB_CLIENT_SECRET }), interval = 260, clock=Date.now, metrics=resourceMetrics } = {}) {
  let token, pending, last = 0, blockedUntil=0;
  const budget=suffix=>{const n=Number(process.env[`VOID_IGDB_${suffix}_BUDGET`]);return Number.isInteger(n)&&n>0?n:0;};
  const guard=createProviderGuard({concurrency:1,maxQueue:200,clock,minuteBudget:budget('MINUTE'),dailyBudget:budget('DAILY'),record:event=>metrics.record('IGDB:guard',event)});
  const requests=new Map();
  const limited=()=>Object.assign(Error('IGDB_UNAVAILABLE'),{status:429,retryAfter:Math.max(1,Math.ceil((blockedUntil-clock())/1000))});
  async function accessToken() {
    if (token && token.expires > Date.now()) return token.value;
    if (pending) return pending;
    pending = (async () => {
      const { id, secret } = credentials();
      if (!id || !secret) throw Error('IGDB_CONFIG');
      await reserveGlobalBudget('twitch');
      const started=clock();let response;
      try{response = await fetcher('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: 'client_credentials' }), signal: AbortSignal.timeout(8000) });}
      catch(error){metrics.record('Twitch:oauth','errors');throw error;}
      finally{metrics.record('Twitch:oauth','requests',clock()-started);}
      if (!response.ok) throw Object.assign(Error('IGDB_AUTH_UNAVAILABLE'),{status:response.status});
      const data = await response.json();
      if (typeof data.access_token !== 'string' || !(data.expires_in > 0)) throw Error('IGDB_AUTH_UNAVAILABLE');
      token = { value: data.access_token, expires: Date.now() + Math.max(0, data.expires_in - 60) * 1000 };
      return token.value;
    })();
    try { return await pending; } finally { pending = null; }
  }
  return function request(endpoint, body) {
    if (!/^[a-z_]+$/.test(endpoint) || typeof body !== 'string') return Promise.reject(Error('IGDB_INVALID_QUERY'));
    const key=endpoint+':'+body,label='IGDB:'+endpoint;
    if(requests.has(key)){metrics.record(label,'deduplicated');return requests.get(key);}
    if(blockedUntil>clock())return Promise.reject(limited());
    if(requests.size>=200)return Promise.reject(consumptionError(503,1));
    const task = guard.run(key,async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        if(blockedUntil>clock())throw limited();
        const delay = interval - (Date.now() - last);
        if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
        const value = await accessToken(); last = Date.now();
        await reserveGlobalBudget('igdb');
        const started=clock();let response;
        try { response = await fetcher(`https://api.igdb.com/v4/${endpoint}`, { method: 'POST', headers: { 'Client-ID': credentials().id, Authorization: `Bearer ${value}`, 'Content-Type': 'text/plain' }, body, signal: AbortSignal.timeout(8000) }); }
        catch(error){metrics.record(label,'errors');throw error;}
        finally{metrics.record(label,'requests',clock()-started);logResourceMetrics();}
        if(response.status===429){
          const header=response.headers?.get('Retry-After');
          const wait=header===null||header===undefined?60000:/^\d+$/.test(header)?Number(header)*1000:Date.parse(header)-clock();
          blockedUntil=clock()+Math.max(1000,Number.isFinite(wait)?wait:60000);
          metrics.record(label,'limited');metrics.record(label,'errors');throw limited();
        }
        if (response.status === 401 && attempt === 0) { token = null; continue; }
        if (!response.ok) {metrics.record(label,'errors');throw Object.assign(Error('IGDB_UNAVAILABLE'),{status:response.status});}
        const rows = await response.json();
        if (!Array.isArray(rows)) throw Error('IGDB_UNAVAILABLE');
        return rows;
      }
    }).finally(()=>requests.delete(key));
    requests.set(key,task);return task;
  };
}
export const requestIGDB = createIGDBClient();
