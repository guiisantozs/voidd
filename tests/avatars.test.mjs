import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { avatarImageUrl, avatarGroups, avatarAlt, avatarColor, safeAvatarReturn, saveCharacterAvatar, readAvatars } from '../lib/avatars.js';
import { validateAvatarManifest } from '../lib/avatar-manifest.js';
import { avatarIdentityStore } from '../lib/avatar-identities.js';
import { prepareAvatarImport, publishAvatarImport } from '../scripts/import-avatars.mjs';
import { readShareReview } from '../lib/review-share-server.js';
import { gameDetailTab, gameDetailTabs } from '../lib/game-detail-tabs.js';

const owner='11111111-1111-4111-8111-111111111111';
const avatar={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',slug:'kratos-one',character_name:'Kratos',media_type:'jogos',media_id:'58175',media_title:'God of War',image_path:'kratos-one/0123456789abcdef/384.webp',bg_color:'#38242c',is_published:true};
const row={slug:'kratos-one',character_name:'Kratos',media_type:'jogos',media_id:'58175',media_title:'God of War',file:'Kratos.png',bg_color:'#38242c'};
const manifest=avatars=>({version:1,avatars});
test('character images use bounded sizes on the configured Storage origin and safe fallbacks',()=>{
 const base='https://project.supabase.co';
 assert.equal(avatarImageUrl(avatar,96,base),base+'/storage/v1/object/public/avatars/kratos-one/0123456789abcdef/96.webp');
 for(const path of ['https://evil.invalid/image.webp','../secret/384.webp','kratos-one/0123456789abcdef/384.webp?x=1','kratos-one/0123456789abcdef/384.webp#x'])assert.equal(avatarImageUrl({...avatar,image_path:path},192,base),'');
 assert.equal(avatarImageUrl({...avatar,is_published:false},192,base),'');
 assert.equal(avatarImageUrl(avatar,512,base),'');assert.equal(avatarImageUrl(avatar,192,'http://127.0.0.1'),'');
 assert.equal(avatarAlt(avatar),'Avatar: Kratos (God of War)');assert.equal(avatarColor({...avatar,bg_color:'url(evil)'}),'#2b1d3b');
});
test('library grouping and search include only published matching works and normalize accents',()=>{
 const rows=[avatar,{...avatar,id:'2',character_name:'Cavaleiro',media_id:'7689',media_title:'Hollow Knight'},{...avatar,id:'3',is_published:false}];
 assert.equal(avatarGroups(rows).length,2);assert.equal(avatarGroups(rows,'krátos','jogos')[0].rows.length,1);assert.equal(avatarGroups(rows,'hollow')[0].title,'Hollow Knight');assert.deepEqual(avatarGroups(rows,'','filmes'),[]);
});
test('manifest validates stable provider IDs, unique slugs, paths, colors and published flags',()=>{
 assert.equal(validateAvatarManifest(manifest([row]))[0].media_id,'58175');
 for(const patch of [{file:'../outside.png'},{file:'/outside.png'},{file:'C:\\outside.png'},{file:'one/../../outside.png'},{media_id:['58175']},{media_id:'god-of-war'},{media_type:'igdb'},{bg_color:'red'},{sort_order:1.5},{is_published:'true'},{unlock_rule:{paid:true}}])assert.throws(()=>validateAvatarManifest(manifest([{...row,...patch}])));
 assert.throws(()=>validateAvatarManifest(manifest([row,row])));
});
test('login return allows only local work avatar tabs and explicit supported universes, never external redirects',()=>{
 for(const url of ['/obra/jogos/58175?tab=avatares','/filme/550?tab=avatares','/obra/animes/123?tab=avatares'])assert.equal(safeAvatarReturn(url),url);
 assert.equal(safeAvatarReturn('/jogos/universos/god-of-war#avatares'),'/jogos/universos/god-of-war#avatares');
 assert.equal(safeAvatarReturn('/jogos/universos/the-last-of-us#avatares'),'/jogos/universos/the-last-of-us#avatares');
 for(const url of ['/jogos/universos/god-of-war#avatares?next=https://evil.invalid','/jogos/universos/god-of-war/../#avatares','/jogos/universos/the-last-of-us#avatares?next=https://evil.invalid','/jogos/universos/the-last-of-us/../#avatares','//jogos/universos/the-last-of-us#avatares'])assert.equal(safeAvatarReturn(url),null);
 for(const url of ['https://evil.invalid','//evil.invalid','/\\evil.invalid','/obra/jogos/58175?tab=avatares&next=https://evil.invalid','/conta','/obra/jogos/0?tab=avatares',null,['/filme/550?tab=avatares']])assert.equal(safeAvatarReturn(url),null);
});
test('game avatar tab is available only when the work supplies a published catalog',()=>{
 assert.equal(gameDetailTab('avatares'),'visao-geral');
 assert.equal(gameDetailTab('avatares',[...gameDetailTabs,['avatares','Avatares 6']]),'avatares');
 assert.equal(gameDetailTab('sua-jornada',[...gameDetailTabs,['avatares','Avatares 6']]),'sua-jornada');
});
test('share cards authorize the review before resolving the current published character',async()=>{
 const oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;process.env.NEXT_PUBLIC_SUPABASE_URL='https://project.supabase.co';
 let published=true,avatarReads=0,privateReview=false;
 const client={async rpc(name){if(name==='void_avatar_identities'){avatarReads++;return {data:[{user_id:owner,avatar:published?avatar:null}]};}return {};},from(table){const query={select(){return this;},eq(){return this;},async maybeSingle(){return {data:table==='void_records'?{payload:{public:!privateReview,nota:0,item:{id:550,categoria:'filmes',titulo:'Filme'}}}:{display_name:'Pessoa',username:'pessoa',visibility:'public',avatar_id:avatar.id}};}};return query;}};
 try{
  assert.equal((await readShareReview(client,owner+'_550')).authorAvatar.id,avatar.id);
  published=false;assert.equal((await readShareReview(client,owner+'_550')).authorAvatar,null);
  const count=avatarReads;privateReview=true;await assert.rejects(readShareReview(client,owner+'_550'),/NOT_FOUND/);assert.equal(avatarReads,count);
 }finally{if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;}
});
test('activation updates only the selected avatar of the owner and does not erase their photo',async()=>{
 let table,patch,filter;
 const query={update(value){patch=value;return this;},eq(...value){filter=value;return this;},select(){return this;},async single(){return {data:{user_id:owner,avatar_id:avatar.id,avatar_url:'https://photo.invalid/original.webp'}};}};
 const identity=await saveCharacterAvatar({from(value){table=value;return query;}},owner,avatar.id);
 assert.equal(table,'void_community_profiles');assert.deepEqual(patch,{avatar_id:avatar.id});assert.deepEqual(filter,['user_id',owner]);assert.ok(identity.avatar_url);
 await saveCharacterAvatar({from:()=>query},owner,null);assert.deepEqual(patch,{avatar_id:null});
 await assert.rejects(saveCharacterAvatar(null,null,avatar.id),/AUTH_REQUIRED/);
});
test('catalog reads published avatars for the exact route key and paginates without truncation',async()=>{
 const calls=[];const query={select(){return this;},eq(...args){calls.push(args);return this;},order(){return this;},range(from,to){calls.push([from,to]);return Promise.resolve({data:from===0?Array(200).fill(avatar):[avatar]});}};
 const rows=await readAvatars({from:()=>query},{mediaType:'jogos',mediaId:58175});
 assert.equal(rows.length,201);assert.ok(calls.some(args=>args[0]==='is_published'&&args[1]===true));assert.ok(calls.some(args=>args[0]==='media_id'&&args[1]==='58175'));assert.ok(calls.some(args=>args[0]===200));
});
test('identity resolution batches mounted avatars and clears a despublished selection',async()=>{
 const calls=[],client={async rpc(name,{ids}){calls.push({name,ids});return {data:ids.map(user_id=>({user_id,avatar_id:avatar.id,avatar}))};}};
 const store=avatarIdentityStore(client);assert.equal(store,avatarIdentityStore(client));
 for(let i=0;i<60;i++)store.get('person-'+i);
 await new Promise(resolve=>setTimeout(resolve,100));
 assert.equal(calls.length,2);assert.ok(calls.every(call=>call.ids.length<=50));assert.equal(store.get('person-1').avatar.id,avatar.id);
 store.seed('person-1',{user_id:'person-1',avatar_id:null,avatar:null});assert.equal(store.get('person-1').avatar,null);
});
test('importer produces three metadata-free WebPs, preserves IDs on upsert and publishes after all uploads',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'void-avatars-'));
 try{
  await fs.writeFile(path.join(temp,'Kratos.png'),await sharp({create:{width:600,height:800,channels:4,background:'#9b64a5'}}).png().toBuffer());
  const manifestPath=path.join(temp,'avatars-manifest.json'),output=path.join(temp,'output');await fs.writeFile(manifestPath,JSON.stringify(manifest([row])));
  const prepared=await prepareAvatarImport(temp,manifestPath,output);assert.equal(prepared.length,1);
  for(const file of prepared[0].files){const meta=await sharp(await fs.readFile(path.join(output,file.name))).metadata();assert.equal(meta.format,'webp');assert.equal(meta.width,Number(path.basename(file.name,'.webp')));assert.equal(meta.height,meta.width);assert.equal(meta.exif,undefined);}
  const calls=[],client={storage:{from(){return {async upload(name,bytes,options){calls.push({upload:name,options});return {};}};}},from(){return {async upsert(record,options){calls.push({record,options});return {};}};}};
  await publishAvatarImport(client,prepared,output);assert.equal(calls.length,4);assert.ok(calls.slice(0,3).every(call=>call.upload));assert.equal(calls[3].options.onConflict,'slug');assert.equal(calls[3].record.id,undefined);
  const failed={...client,storage:{from(){return {async upload(){return {error:{message:'upload failed'}};}};}}};
  await assert.rejects(publishAvatarImport(failed,prepared,output),/Falha no upload/);assert.equal(calls.length,4);
 }finally{assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('void-avatars-'));await fs.rm(temp,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
});
