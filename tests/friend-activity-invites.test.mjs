import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { filteredFriends,loadFriendActivity,friendPoster } from '../lib/friend-activity.js';
import { INVITE_KEY,INVITE_TTL,rememberInvite,readInvite,claimInvite,clearInvite,requestFriend,personalInviteUrl } from '../lib/friend-invites.js';
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
const sdk=fetch=>createClient('https://void.test','public-test-key',{global:{fetch},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});

test('friend review thumbnails use the small TMDB image without changing work identity or other providers',()=>{
  assert.equal(friendPoster('https://image.tmdb.org/t/p/original/poster.jpg'),'https://image.tmdb.org/t/p/w92/poster.jpg');
  assert.equal(friendPoster('https://image.tmdb.org/t/p/w500/poster.jpg?x=1'),'https://image.tmdb.org/t/p/w92/poster.jpg?x=1');
  for(const url of ['https://media.rawg.io/media/games/poster.jpg','https://example.test/t/p/w500/poster.jpg',''])assert.equal(friendPoster(url),url);
  assert.equal(friendPoster(null),'');
});

test('referrals expire after seven days, preserve original expiry and reject malformed/future references',()=>{
  const store=storage(),now=Date.now();rememberInvite(store,'@pessoa_a',now);
  assert.equal(readInvite(store,now+INVITE_TTL-1).handle,'pessoa_a');
  assert.equal(rememberInvite(store,'pessoa_a',now+1000).createdAt,now);
  assert.equal(readInvite(store,now+INVITE_TTL),null);assert.equal(store.getItem(INVITE_KEY),null);
  store.setItem(INVITE_KEY,JSON.stringify({handle:'pessoa_a',createdAt:now+1}));assert.equal(readInvite(store,now),null);
  store.setItem(INVITE_KEY,'{invalid');assert.equal(readInvite(store,now),null);
  assert.throws(()=>rememberInvite(store,'../../conta',now));
});
test('referrals bind to the first account and completing an old request cannot remove a newer referral',()=>{
  const store=storage(),now=Date.now();rememberInvite(store,'pessoa_a',now);
  const reference=claimInvite(store,'account_b',now);assert.equal(reference.owner,'account_b');
  assert.equal(claimInvite(store,'account_c',now),null);
  rememberInvite(store,'pessoa_a',now+10);assert.equal(readInvite(store,now+10).owner,'account_b');
  rememberInvite(store,'pessoa_c',now+20);clearInvite(store,reference,now+20);assert.equal(readInvite(store,now+20).handle,'pessoa_c');
  const next=claimInvite(store,'account_c',now+20);clearInvite(store,next,now+20);assert.equal(store.getItem(INVITE_KEY),null);
});
test('personal link follows the username route and never embeds origin credentials, query or fragments',()=>{
  assert.equal(personalInviteUrl('https://void.test/path?x=1#h','pessoa_a'),'https://void.test/convite/pessoa_a');
  assert.equal(personalInviteUrl('https://user:password@void.test','pessoa_a'),'https://void.test/convite/pessoa_a');
  assert.equal(personalInviteUrl('javascript:bad','pessoa_a'),'');assert.equal(personalInviteUrl('https://void.test','../bad'),'');
});
test('friend list filtering accepts names and handles, sorting by only visible public activity with stable A–Z fallback',()=>{
  const people=[{user_id:'a',display_name:'Ana',username:'ana_void'},{user_id:'b',display_name:'Bruno',username:'bruno_void'},{user_id:'c',display_name:'Carol',username:null}];
  const latest={b:{updated_at:'2026-10-21T10:00:00Z'},a:{updated_at:'2026-10-20T10:00:00Z'}};
  assert.deepEqual(filteredFriends(people,latest).map(p=>p.user_id),['b','a','c']);
  assert.deepEqual(filteredFriends(people,latest,'','az').map(p=>p.user_id),['a','b','c']);
  assert.deepEqual(filteredFriends(people,latest,'@BRUNO').map(p=>p.user_id),['b']);
  assert.equal(filteredFriends(people,latest,'nobody').length,0);assert.equal(people[0].user_id,'a');
});
test('feed uses one RPC, passes complete stable cursor, preserves zero ratings and propagates failures',async()=>{
  const requests=[],row={user_id:'a',item_key:'filmes:1',rating:0};const cursor={time:'2026-10-21T12:00:00Z',user:'a',item:'filmes:1'};
  const client=sdk(async(url,options)=>{requests.push({url:String(url),body:JSON.parse(options.body)});return response({rows:[row],has_more:true,cursor});});
  const first=await loadFriendActivity(client);assert.equal(first.rows[0].rating,0);assert.equal(requests.length,1);
  await loadFriendActivity(client,{cursor});assert.deepEqual(requests[1].body,{latest:false,before_time:cursor.time,before_user:cursor.user,before_item:cursor.item});
  await loadFriendActivity(client,{latest:true});assert.equal(requests[2].body.latest,true);assert.match(requests[0].url,/rpc\/void_friend_activity$/);
  await assert.rejects(loadFriendActivity(sdk(async()=>response({message:'denied',code:'42501'},403))));
});
test('referral requests use authenticated server identity, normalize handle and never send accepted status or participant IDs',async()=>{
  let body;const client=sdk(async(url,options)=>{body=JSON.parse(options.body);assert.match(String(url),/rpc\/void_request_friend$/);return response('sent');});
  assert.equal(await requestFriend(client,' @PESSOA_A '),'sent');assert.deepEqual(body,{handle:'pessoa_a'});
  await assert.rejects(requestFriend(client,'../invalid'));
  for(const state of ['received','friends','self','missing'])assert.equal(await requestFriend(sdk(async()=>response(state)),'pessoa_a'),state);
  await assert.rejects(requestFriend(sdk(async()=>response({message:'RATE_LIMIT',code:'P0001'},400)),'pessoa_a'));
  await assert.rejects(requestFriend(sdk(async()=>response('unexpected')),'pessoa_a'));
});
