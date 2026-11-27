import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyncQueue } from '../lib/account-sync.js';
import { authErrorMessage, authLinkMessage, emailIsValid, markRecovery, recoveryPending, RECOVERY_KEY, sendAccountEmail } from '../lib/account-auth.js';
import { LIST_KEY, REVIEWS_KEY, scopedStorage, syncAccount } from '../lib/account-storage.js';
const store = () => { const data=new Map(); return { getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key) }; };
const deferred = () => { let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve}; };

test('new account sync is independent from an old account still in flight', async () => {
  const first=deferred();const calls=[];
  const run=createSyncQueue(async id=>{calls.push(id);if(id==='first') await first.promise;return id;});
  const pending=run('first',true);
  assert.equal(await run('second',true),'second'); assert.deepEqual(calls,['first','second']);
  first.resolve();assert.equal(await pending,'first');
});
test('download requested during upload is preserved and duplicate downloads share work', async () => {
  const upload=deferred();const calls=[];
  const run=createSyncQueue(async(id,pull)=>{calls.push(pull);if(!pull) await upload.promise;return pull;});
  const push=run('u');const pull1=run('u',true);const pull2=run('u',true);
  await Promise.resolve();assert.deepEqual(calls,[false]);upload.resolve();
  assert.deepEqual(await Promise.all([push,pull1,pull2]),[false,true,true]);assert.deepEqual(calls,[false,true]);
});
test('a failed sync releases the queue so pending local records can retry', async () => {
  let attempts=0;const run=createSyncQueue(async()=>{if(++attempts===1) throw Error('offline');return 'ok';});
  await assert.rejects(run('u'),/offline/);assert.equal(await run('u'),'ok');assert.equal(attempts,2);
});
test('recovery email requests validate input and preserve the native destination', async () => {
  const calls=[];const client={auth:{resend:async args=>{calls.push(args);return {};},resetPasswordForEmail:async(...args)=>{calls.push(args);return {};}}};
  assert.equal(emailIsValid('incorrect'),false);await assert.rejects(sendAccountEmail(client,'recovery','incorrect','http://localhost:3000'),/EMAIL/);assert.equal(calls.length,0);
  await sendAccountEmail(client,'recovery','a@example.test','https://void.example');
  assert.deepEqual(calls,[['a@example.test',{redirectTo:'https://void.example/conta'}]]);
  await assert.rejects(sendAccountEmail({auth:{resetPasswordForEmail:async()=>({error:{code:'over_email_send_rate_limit'}})}},'recovery','a@example.test','http://localhost:3000'),error=>error.code==='over_email_send_rate_limit');
});
test('expired links and auth failures use clear messages without rendering upstream secrets', () => {
  assert.match(authErrorMessage({code:'email_not_confirmed'}),/acesso imediato/);
  assert.match(authErrorMessage({code:'invalid_credentials'}),/incorretos/);
  assert.match(authErrorMessage({status:429}),/Aguarde/);
  assert.match(authLinkMessage('','#error=access_denied&error_code=otp_expired&error_description=private-data'),/expirou/);
  assert.equal(authLinkMessage('?code=valid-callback','#access_token=not-rendered'),'');
  assert.ok(!authErrorMessage({message:'private-data'}).includes('private-data'));
});
test('password recovery survives refresh only for the same account and expires', () => {
  const storage=store();markRecovery(storage,'a',1000);
  assert.equal(recoveryPending(storage,'a',2000),true);assert.equal(recoveryPending(storage,'b',2000),false);
  assert.equal(recoveryPending(storage,'a',1000+30*60*1000),false);
  storage.removeItem(RECOVERY_KEY);assert.equal(recoveryPending(storage,'a',2000),false);
  storage.setItem(RECOVERY_KEY,'broken');assert.equal(recoveryPending(storage,'a'),false);
});
test('two independent device caches exchange reviews, removals and queued offline changes', async () => {
  const cloud=new Map();let offline=false;
  const client={from:()=>({upsert:async rows=>{if(offline) return {error:Error('offline')};rows.forEach(row=>cloud.set(`${row.kind}:${row.item_key}`,structuredClone(row)));return {error:null};},select(){return this;},eq(column,id){assert.equal(column,'user_id');assert.equal(id,'u');return this;},order(){return this;},range:async(start,end)=>({data:[...cloud.values()].slice(start,end+1),error:null})})};
  const a=store(),b=store();const sa=scopedStorage(a,'u'),sb=scopedStorage(b,'u');
  const item={id:42,categoria:'jogos',titulo:'Teste'};
  sa.setItem(REVIEWS_KEY,JSON.stringify({'jogos:42':{item,nota:4}}));sa.setItem(LIST_KEY,JSON.stringify({42:{item,status:'want'}}));
  await syncAccount(client,a,'u',true);await syncAccount(client,b,'u',true);
  assert.equal(JSON.parse(sb.getItem(REVIEWS_KEY))['jogos:42'].nota,4);
  sb.setItem(LIST_KEY,'{}');await syncAccount(client,b,'u');await syncAccount(client,a,'u',true);assert.deepEqual(JSON.parse(sa.getItem(LIST_KEY)),{});
  sa.setItem(REVIEWS_KEY,JSON.stringify({'jogos:42':{item,nota:5}}));offline=true;
  await assert.rejects(syncAccount(client,a,'u'),/offline/);assert.equal(JSON.parse(sb.getItem(REVIEWS_KEY))['jogos:42'].nota,4);
  offline=false;await syncAccount(client,a,'u');await syncAccount(client,b,'u',true);assert.equal(JSON.parse(sb.getItem(REVIEWS_KEY))['jogos:42'].nota,5);
});
