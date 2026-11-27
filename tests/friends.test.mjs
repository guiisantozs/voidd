import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { connectionLists,connectionTime,friendTab,loadConnections,changeInvitation,removeFriend } from '../lib/friends.js';

const accepted=(sender,recipient)=>({sender,recipient,status:'accepted',created_at:'2026-10-19T12:00:00Z'});
const pending=(sender,recipient)=>({...accepted(sender,recipient),status:'pending'});
const follow=(follower_id,followed_id)=>({follower_id,followed_id});
function sdk(fetch){return createClient('https://void.test','public-test-key',{global:{fetch},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});}

test('large circles load every identity with at most three parallel bounded requests',async()=>{
  const people=Array.from({length:170},(_,i)=>'friend_'+i);let active=0,maximum=0,batches=0;
  const client=sdk(async(input,options)=>{
    const url=new URL(input);
    if(url.pathname.endsWith('/void_friendships'))return response(people.map(id=>accepted('owner',id)));
    if(url.pathname.endsWith('/follows'))return response([]);
    const {ids}=JSON.parse(options.body);assert.ok(ids.length<=50);active++;batches++;maximum=Math.max(maximum,active);
    await new Promise(resolve=>setTimeout(resolve,10));active--;
    return response(ids.map(user_id=>({user_id,username:user_id,display_name:user_id})));
  });
  const data=await loadConnections(client,'owner');
  assert.equal(data.amigos.length,170);assert.equal(Object.keys(data.people).length,171);assert.equal(batches,4);assert.equal(maximum,3);
});
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});

test('friends merge mutual follows and accepted invitations once; pending badge counts received invitations only',()=>{
  const friendships=[accepted('a','b'),accepted('a','c'),pending('d','a'),pending('a','e'),pending('x','y')];
  const follows=[follow('a','b'),follow('b','a'),follow('a','f'),follow('g','a'),follow('x','y')];
  const data=connectionLists('a',friendships,follows,{b:{display_name:'B',username:'pessoa_b'}});
  assert.deepEqual(data.counts,{amigos:2,seguidores:2,seguindo:2,convites:1});
  assert.deepEqual(data.amigos.map(p=>p.user_id).sort(),['b','c']);
  assert.equal(data.amigos.find(p=>p.user_id==='b').mutual,true);
  assert.equal(data.received[0].user_id,'d');assert.equal(data.sent[0].user_id,'e');
  assert.equal(data.received[0].username,undefined);assert.equal(data.received[0].display_name,'Pessoa do Void');
  assert.ok(!JSON.stringify(data).includes('"x"'));
});

test('accept, decline, cancel and unreciprocated follows update the appropriate derived lists',()=>{
  assert.equal(connectionLists('a',[pending('b','a')]).counts.convites,1);
  assert.equal(connectionLists('a',[accepted('b','a')]).counts.amigos,1);
  assert.equal(connectionLists('a',[accepted('b','a')]).counts.convites,0);
  assert.equal(connectionLists('a',[]).received.length,0);
  assert.equal(connectionLists('a',[]).sent.length,0);
  assert.equal(connectionLists('a',[],[follow('a','b')]).counts.amigos,0);
  assert.equal(connectionLists('a',[],[follow('a','b'),follow('b','a')]).counts.amigos,1);
});

test('tab values and invitation times are valid, stable and neutral for incomplete timestamps',()=>{
  assert.equal(friendTab('convites'),'convites');assert.equal(friendTab('seguindo'),'seguindo');assert.equal(friendTab('descobrir'),'amigos');assert.equal(friendTab(['convites']),'amigos');
  const now=Date.parse('2026-10-21T12:00:00Z');
  assert.equal(connectionTime('2026-10-19T12:00:00Z',now),'há 2 dias');
  assert.equal(connectionTime('2026-10-21T11:00:00Z',now),'há 1 hora');
  assert.equal(connectionTime('2026-10-21T12:01:00Z',now),'agora');
  assert.equal(connectionTime('invalid',now),'Data não informada');
});

test('connection reads stay scoped to the current account, paginate beyond default limits and resolve identities in batches',async()=>{
  const requests=[];
  const client=sdk(async(input,options)=>{
    const url=new URL(input);requests.push({url,options});
    if(url.pathname.endsWith('void_friendships'))return response([pending('b','a')]);
    if(url.pathname.endsWith('/follows'))return response(Array.from({length:url.searchParams.get('offset')==='0'?500:1},(_,i)=>follow('a',`person-${Number(url.searchParams.get('offset'))+i}`)));
    const {ids}=JSON.parse(options.body);assert.ok(ids.length<=50);return response(ids.map(user_id=>({user_id,display_name:user_id,username:null})));
  });
  const result=await loadConnections(client,'a');
  assert.equal(result.counts.seguindo,501);assert.equal(result.counts.convites,1);
  assert.equal(requests.filter(r=>r.url.pathname.endsWith('/follows')).length,2);
  const friendship=requests.find(r=>r.url.pathname.endsWith('/void_friendships')).url;
  assert.equal(friendship.searchParams.get('or'),'(sender.eq.a,recipient.eq.a)');
  assert.ok(friendship.searchParams.get('select').includes('created_at'));
  for(const {url} of requests.filter(r=>r.url.pathname.endsWith('/follows')))assert.equal(url.searchParams.get('or'),'(follower_id.eq.a,followed_id.eq.a)');
});

test('invitation mutations require the correct participant and a pending status; stale actions are detected',async()=>{
  const requests=[];
  const client=sdk(async(input,options)=>{requests.push({url:new URL(input),options});return response([{sender:'a'}]);});
  const person={user_id:'a',connection:pending('a','b')};
  await assert.rejects(changeInvitation(client,'a',person,'accept'));
  await assert.rejects(changeInvitation(client,'b',person,'cancel'));
  await assert.rejects(changeInvitation(client,'x',person,'decline'));assert.equal(requests.length,0);
  await changeInvitation(client,'b',person,'accept');await changeInvitation(client,'b',person,'decline');await changeInvitation(client,'a',person,'cancel');
  assert.deepEqual(requests.map(r=>r.options.method),['PATCH','DELETE','DELETE']);
  for(const {url} of requests){assert.equal(url.searchParams.get('sender'),'eq.a');assert.equal(url.searchParams.get('recipient'),'eq.b');assert.equal(url.searchParams.get('status'),'eq.pending');}
  const stale=sdk(async()=>response([]));await assert.rejects(changeInvitation(stale,'b',person,'accept'),/STALE_INVITE/);
});

test('removing a friend removes accepted invitation and only the caller follow when reciprocal, preserving the other follower',async()=>{
  const requests=[];const client=sdk(async(input,options)=>{requests.push({url:new URL(input),options});return response(null);});
  await removeFriend(client,'a',{user_id:'b',mutual:true,friendship:accepted('b','a')});
  assert.equal(requests.length,2);assert.equal(requests[0].url.searchParams.get('status'),'eq.accepted');
  assert.equal(requests[1].url.searchParams.get('follower_id'),'eq.a');assert.equal(requests[1].url.searchParams.get('followed_id'),'eq.b');
  requests.length=0;
  await removeFriend(client,'a',{user_id:'b',mutual:false,friendship:accepted('a','b')});assert.equal(requests.length,1);
  await assert.rejects(removeFriend(client,'a',{user_id:'x',friendship:accepted('a','b')}),/INVALID_INVITE/);
});

test('failed social reads and partially failed removals propagate errors instead of reporting an empty list or success',async()=>{
  const failing=sdk(async()=>response({message:'Denied',code:'42501'},403));
  await assert.rejects(loadConnections(failing,'a'));
  const partial=sdk(async input=>new URL(input).pathname.endsWith('/follows')?response({message:'failed'},400):response(null));
  await assert.rejects(removeFriend(partial,'a',{user_id:'b',mutual:true,friendship:accepted('a','b')}));
});
