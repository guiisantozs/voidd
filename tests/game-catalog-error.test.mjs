import test from 'node:test';
import assert from 'node:assert/strict';
import {gameCatalogError,GAME_CATALOG_CONFIGURATION_MESSAGE} from '../lib/game-catalog-error.js';
import {createGameHighlightsHandler} from '../pages/api/game-highlights.js';
import {fetchGameHome} from '../lib/game-home-client.js';

test('catalog configuration failures are sanitized and never cached',async()=>{
 for(const error of [Error('CONFIG'),Object.assign(Error('private provider diagnostic'),{status:401}),Object.assign(Error('private provider diagnostic'),{status:403})]){
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(body){this.body=body;return this;}};
  await createGameHighlightsHandler(async()=>{throw error;})({method:'GET'},res);
  assert.equal(res.code,503);
  assert.equal(res.headers['Cache-Control'],'no-store');
  assert.equal(res.body.erro,GAME_CATALOG_CONFIGURATION_MESSAGE);
  assert.equal(res.body.code,'GAME_CATALOG_CONFIGURATION');
  assert.ok(!JSON.stringify(res.body).includes('private provider diagnostic'));
 }
 assert.equal(gameCatalogError({status:429},'Try later').status,502);
 assert.equal(gameCatalogError(Error('fetch failed'),'Try later').body.erro,'Try later');
});

test('browser distinguishes configuration from temporary failures without reflecting arbitrary error text',async()=>{
 await assert.rejects(fetchGameHome({fetcher:async()=>({ok:false,json:async()=>({code:'GAME_CATALOG_CONFIGURATION',erro:'private diagnostic'})})}),{message:GAME_CATALOG_CONFIGURATION_MESSAGE});
 await assert.rejects(fetchGameHome({fetcher:async()=>({ok:false,json:async()=>({erro:'private diagnostic'})})}),error=>!error.message.includes('private diagnostic'));
});
