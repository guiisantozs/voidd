import test from 'node:test';
import assert from 'node:assert/strict';
import {safeSocialReturn,socialRpc,socialError} from '../lib/social-community.js';
import {notificationHref,notificationText} from '../lib/notifications.js';
test('login preserves only exact local invitations or the existing avatar destination',()=>{
 const token='ab'.repeat(32),uuid='20000000-0000-4000-8000-000000000001';
 for(const path of [`/listas/convite?token=${token}`,`/listas/convites?lista=${uuid}`,'/listas/convites','/obra/jogos/12?tab=avatares'])assert.equal(safeSocialReturn(path),path);
 for(const value of [null,[],{},'https://evil.test','//evil.test','/listas/convite?token=small',`/listas/convite?token=${token}&next=https://evil.test`, '/listas/convites/../../conta','javascript:alert(1)','/conta','/listas/convites?lista=x'])assert.equal(safeSocialReturn(value),null);
});
test('recommendation destinations preserve category and ID even for identical titles',()=>{
 for(const media of ['filmes','series','jogos','animes']){
  const row={type:'work_recommendation',data:{actor_name:'Ana',title:'Mesmo título',work:{id:'90',categoria:media}}};
  assert.equal(notificationHref(row),media==='filmes'?'/filme/90':`/obra/${media}/90`);assert.match(notificationText(row),/Ana recomendou Mesmo título/);
 }
 for(const work of [{id:'//evil.test',categoria:'jogos'},{id:1,categoria:'livros'},null])assert.equal(notificationHref({type:'work_recommendation',data:{work}}),'/notificacoes');
});
test('RPC propagates abort and backend permission failures without pretending a send succeeded',async()=>{
 const controller=new AbortController(),failure={code:'42501',message:'Internal details must stay out of UI'},calls=[];
 const client={rpc(name,args){calls.push({name,args});return {abortSignal(signal){assert.equal(signal,controller.signal);return Promise.resolve({error:failure});}};}};
 await assert.rejects(socialRpc(client,'void_recommend_work',{recipients:['friend']},controller.signal),error=>error===failure);
 assert.equal(calls.length,1);assert.equal(calls[0].args.sender,undefined);assert.doesNotMatch(socialError(failure),/Internal/);
 assert.match(socialError({message:'INVALID_INVITE'}),/desativado/);
});
