import test from 'node:test';
import assert from 'node:assert/strict';
import { groupNotifications, notificationHref, notificationText, notificationTypes, notificationPeriod, notificationQuery } from '../lib/notifications.js';
import { createClient } from '@supabase/supabase-js';
import {notificationReadSnapshot,markNotificationSnapshot} from '../lib/notifications.js';
const row = (id, actor, more = {}) => ({ id, actor_id: actor, type: 'review_like', entity_type: 'review', entity_id: 'author/filmes:12', created_at: '2026-10-22T12:00:00Z', read_at: null, data: { actor_name: 'Ana', title: 'Teste' }, ...more });
test('groups distinct actors on the same review/day/read status', () => {
 const groups = groupNotifications([row('1','a'),row('2','b'),row('3','c'),row('4','d')]);
 assert.equal(groups.length,1);assert.equal(groups[0].ids.length,4);assert.equal(notificationText(groups[0]),'Ana e mais 3 pessoas curtiram sua review de Teste');
});
test('separates read, day, entity and event types; avoids duplicate actor names', () => {
 assert.equal(groupNotifications([row('1','a'),row('2','a')])[0].actors.size,1);
 assert.equal(groupNotifications([row('1','a'),row('2','b',{read_at:'now'}),row('3','c',{created_at:'2026-10-21T12:00:00Z'}),row('4','d',{entity_id:'author/filmes:13'}),row('5','e',{type:'mention'})]).length,5);
});
test('routes to invitations, targeted movie review/comments and actor profile', () => {
 assert.equal(notificationHref(row('1','a',{type:'friend_request'})),'/amigos?aba=convites');
 assert.equal(notificationHref(row('1','a')),'/filme/12?tab=reviews&review=author');
 assert.match(notificationHref(row('1','a',{data:{comment_id:'c'}})),/comments=1$/);
 assert.equal(notificationHref(row('1','a',{entity_type:'profile'})),'/pessoas/a');
 assert.equal(notificationHref(row('1',null,{entity_type:'achievement'})),'/perfil');
});
test('all notification types have preferences and safe fallback text', () => {
 assert.equal(Object.keys(notificationTypes).length,11);
 for(const type of Object.keys(notificationTypes))assert.ok(notificationText({type}));
});

test('notification period is exactly 24 rolling hours across month/year boundaries', () => {
 for (const now of ['2027-01-01T01:15:00-03:00', '2028-03-01T00:30:00Z']) {
  const period = notificationPeriod(now);
  assert.equal(Date.parse(period.until) - Date.parse(period.since), 86400000);
  assert.equal(period.until, new Date(now).toISOString());
 }
 assert.equal(notificationPeriod('2026-10-22T18:00:00-03:00').since, '2026-10-21T21:00:00.000Z');
});

test('inbox, unread filter and badge send the same bounded period and account to Supabase before pagination', async () => {
 const calls = [];
 const client = createClient('https://notifications.example.invalid', 'public-test-key', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: async (url, options) => {
   calls.push({ url: new URL(url), options });
   return new Response(options.method === 'HEAD' ? null : '[]', { headers: { 'Content-Type': 'application/json', 'Content-Range': '*/0' } });
  } },
 });
 const now = Date.parse('2026-10-22T21:00:00Z');
 await notificationQuery(client, 'account-a', { now }).order('created_at', { ascending: false }).limit(10);
 await notificationQuery(client, 'account-a', { now, unread: true }).order('created_at', { ascending: false }).limit(21);
 await notificationQuery(client, 'account-a', { now, unread: true, count: true });
 assert.equal(calls.length, 3);
 for (const { url } of calls) {
  assert.equal(url.pathname, '/rest/v1/notifications');
  assert.equal(url.searchParams.get('user_id'), 'eq.account-a');
  assert.deepEqual(url.searchParams.getAll('created_at'), ['gte.2026-10-21T21:00:00.000Z', 'lte.2026-10-22T21:00:00.000Z']);
 }
 assert.equal(calls[0].url.searchParams.has('read_at'), false);
 assert.equal(calls[0].url.searchParams.get('limit'), '10');
 assert.equal(calls[1].url.searchParams.get('read_at'), 'is.null');
 assert.equal(calls[1].url.searchParams.get('limit'), '21');
 assert.equal(calls[2].options.method, 'HEAD');
 assert.equal(calls[2].url.searchParams.get('read_at'), 'is.null');
 assert.match(new Headers(calls[2].options.headers).get('Prefer'), /count=exact/);
});

test('opening freezes loaded unread IDs and excludes notifications arriving during or after opening',async()=>{
 const opening=Date.parse('2026-10-23T18:00:00Z');
 const rows=[row('old','a',{created_at:'2026-10-23T17:59:59Z'}),row('read','a',{read_at:'saved',created_at:'2026-10-23T17:59:58Z'}),row('new','a',{created_at:'2026-10-23T18:00:01Z'})];
 const ids=notificationReadSnapshot(rows,opening);assert.deepEqual(ids,['old']);
 let payload,url;const client=createClient('https://notifications.example.invalid','public-test-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,options)=>{url=new URL(input);payload=JSON.parse(options.body);rows.push(row('later','a'));return new Response('[{"id":"old"}]',{headers:{'Content-Type':'application/json'}});}}});
 assert.deepEqual(await markNotificationSnapshot(client,'owner-a',ids,new Date(opening)),['old']);
 assert.equal(url.searchParams.get('id'),'in.(old)');assert.equal(url.searchParams.get('user_id'),'eq.owner-a');assert.equal(url.searchParams.get('read_at'),'is.null');assert.equal(payload.read_at,'2026-10-23T18:00:00.000Z');
 assert.equal(rows.find(r=>r.id==='new').read_at,null);assert.deepEqual(notificationReadSnapshot([rows[0],rows[0]],opening),['old']);
});
test('automatic reading does not hide persistence failures or send an unbounded update for empty snapshots',async()=>{
 let requests=0;const client={from:()=>{requests++;return {update:()=>({eq:()=>({is:()=>({in:()=>({select:async()=>({error:Error('offline')})})})})})};}};
 assert.deepEqual(await markNotificationSnapshot(client,'owner',[]),[]);assert.equal(requests,0);await assert.rejects(markNotificationSnapshot(client,'owner',['old']),/offline/);
});
