import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveGlobalBudget } from '../lib/global-provider-budget.js';
const env = { VOID_GLOBAL_BUDGETS_ENABLED:'1', VOID_GLOBAL_TMDB_MINUTE:'2', VOID_GLOBAL_TMDB_DAILY:'3' };

test('independent server instances share one external call budget via the RPC', async () => {
  let used = 0;
  const client = () => ({ rpc: async (name, args) => { assert.equal(name,'void_reserve_provider_budget'); assert.equal(args.p_scope,'tmdb'); return {data:++used<=2?0:60,error:null}; } });
  await reserveGlobalBudget('TMDB',{env,client:client()});
  await reserveGlobalBudget('tmdb',{env,client:client()});
  await assert.rejects(reserveGlobalBudget('tmdb',{env,client:client()}),e=>e.status===429&&e.retryAfter===60);
});
test('enabled budgets fail closed on missing config, database errors and malformed results', async () => {
  await assert.rejects(reserveGlobalBudget('tmdb',{env:{VOID_GLOBAL_BUDGETS_ENABLED:'1'}}),e=>e.status===503);
  for(const response of [{data:null,error:{}},{data:'0',error:null},{data:-1,error:null}]) {
    await assert.rejects(reserveGlobalBudget('tmdb',{env,client:{rpc:async()=>response}}),e=>e.status===503);
  }
  await reserveGlobalBudget('tmdb',{env:{},client:{rpc:async()=>{throw Error('must not run');}}});
});
