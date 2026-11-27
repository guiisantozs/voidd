import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { loadCommunityReviews, reviewWindow, reviewSearch } from '../lib/community-reviews.js';

test('community period is a rolling thirty days with a fixed upper boundary and search input is bounded',()=>{
  assert.deepEqual(reviewWindow('2026-10-21T12:00:00Z'),{start:'2026-09-21T12:00:00.000Z',end:'2026-10-21T12:00:00.000Z'});
  assert.deepEqual(reviewWindow('2024-03-15T00:00:00Z'),{start:'2024-02-14T00:00:00.000Z',end:'2024-03-15T00:00:00.000Z'});
  assert.equal(reviewSearch('  O   filme  '),'O filme');assert.equal(reviewSearch('a'.repeat(120)).length,100);
  assert.equal(reviewSearch(null),'');assert.throws(()=>reviewWindow('invalid'));
});

test('actual Supabase builder filters public movie reviews in the server, escapes title wildcards and requests a bounded stable page',async()=>{
  const requests=[];
  const fetch=async(input,options)=>{
    const url=new URL(input);requests.push({url,options});
    const identity=url.pathname.endsWith('/rpc/void_identities');
    return new Response(JSON.stringify(identity?[{user_id:'person',username:'pessoa',display_name:'Pessoa'}]:[{user_id:'person',item_key:'filmes:42',rating:0,movie:{id:42,titulo:'Filme'},spoiler:true,text:'Spoiler'}]),{status:200,headers:{'Content-Type':'application/json','Content-Range':'12-12/13'}});
  };
  const client=createClient('https://void.test','public-test-key',{global:{fetch},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const result=await loadCommunityReviews(client,{query:'100%_filme',page:1,now:'2026-10-21T12:00:00Z'});
  const {url,options}=requests[0];
  assert.equal(url.searchParams.get('kind'),'eq.review');assert.equal(url.searchParams.get('is_public'),'eq.true');
  assert.equal(url.searchParams.get('item_key'),'like.filmes:%');
  assert.deepEqual(url.searchParams.getAll('updated_at'),['gte.2026-09-21T12:00:00.000Z','lte.2026-10-21T12:00:00.000Z']);
  assert.equal(url.searchParams.get('payload->item->>titulo'),'ilike.%100\\%\\_filme%');
  assert.equal(url.searchParams.get('order'),'updated_at.desc,user_id.desc,item_key.desc');
  assert.equal(url.searchParams.get('offset'),'12');assert.equal(url.searchParams.get('limit'),'12');
  assert.ok(new Headers(options.headers).get('prefer').includes('count=exact'));
  assert.ok(url.searchParams.get('select').includes('text:payload->>texto'));assert.ok(!url.searchParams.get('select').includes('*'));
  assert.equal(result.total,13);assert.equal(result.rows[0].username,'pessoa');assert.equal(result.rows[0].rating,0);assert.equal(result.rows[0].spoiler,true);
  assert.equal(requests.length,3); // Page, identities and one bounded reactions aggregate; no per-card calls.
  assert.ok(requests[2].url.pathname.endsWith('/rpc/void_review_reactions'));
});

test('invalid page requests never reach the network and upstream errors do not become empty success',async()=>{
  let calls=0;
  const client=createClient('https://void.test','public-test-key',{global:{fetch:async()=>{calls++;return new Response(JSON.stringify({message:'invalid query'}),{status:400,headers:{'Content-Type':'application/json'}});}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  for(const page of [-1,1.5,100001])await assert.rejects(loadCommunityReviews(client,{page}));
  assert.equal(calls,0);
  await assert.rejects(loadCommunityReviews(client));assert.equal(calls,1);
  await assert.rejects(loadCommunityReviews(client,{audience:'followers'}));assert.equal(calls,1);
});

test('friends use the authenticated database function with the same exact count, search, dates and stable pagination',async()=>{
  const requests=[];
  const controller=new AbortController();
  const client=createClient('https://void.test','public-test-key',{global:{fetch:async(input,options)=>{
    requests.push({url:new URL(input),options});
    return new Response('[]',{status:200,headers:{'Content-Type':'application/json','Content-Range':'*/0'}});
  }},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const result=await loadCommunityReviews(client,{audience:'friends',query:'100%_filme',page:2,now:'2026-10-26T12:00:00Z',signal:controller.signal});
  assert.deepEqual(result,{rows:[],total:0});
  assert.equal(requests.length,1); // No client-side friend list or community fallback.
  const {url,options}=requests[0];
  assert.equal(url.pathname,'/rest/v1/rpc/void_confirmed_friend_reviews');
  assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{});
  assert.equal(options.signal,controller.signal);
  assert.ok(new Headers(options.headers).get('prefer').includes('count=exact'));
  assert.equal(url.searchParams.get('is_public'),'eq.true');
  assert.equal(url.searchParams.get('kind'),'eq.review');
  assert.equal(url.searchParams.get('item_key'),'like.filmes:%');
  assert.equal(url.searchParams.get('payload->item->>titulo'),'ilike.%100\\%\\_filme%');
  assert.equal(url.searchParams.get('order'),'updated_at.desc,user_id.desc,item_key.desc');
  assert.equal(url.searchParams.get('offset'),'24');assert.equal(url.searchParams.get('limit'),'12');
  assert.deepEqual(url.searchParams.getAll('updated_at'),['gte.2026-09-26T12:00:00.000Z','lte.2026-10-26T12:00:00.000Z']);
});

test('unavailable or unauthorized friends queries fail without silently returning community reviews',async()=>{
  let calls=0;
  const client=createClient('https://void.test','public-test-key',{global:{fetch:async(input)=>{
    calls++;assert.ok(new URL(input).pathname.endsWith('/rpc/void_confirmed_friend_reviews'));
    return new Response(JSON.stringify({message:'permission denied',code:'42501'}),{status:403,headers:{'Content-Type':'application/json'}});
  }},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  await assert.rejects(loadCommunityReviews(client,{audience:'friends'}));
  assert.equal(calls,1);
});
