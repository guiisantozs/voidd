import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { FEED_DEFAULTS, normalizeFeedFilters, feedFilterQuery, activeFeedFilters, loadReviewsFeed, mergeFeedRows, reviewFeedContext, feedVisitKey } from '../lib/reviews-feed.js';
import { gameReviewForm, completeGameReview } from '../lib/game-review.js';
import { notificationHref } from '../lib/notifications.js';

test('feed URL validates enums, retains zero and tenths and round-trips combined filters',()=>{
  const filters=normalizeFeedFilters({tab:'amigos',period:'week',minRating:'0',maxRating:'4,7',platform:'playstation',genre:'action',status:'finished',text:'with',sort:'comments',q:'  God  of\nWar  '});
  assert.equal(filters.q,'God of War');assert.equal(filters.minRating,'0');assert.equal(filters.maxRating,'4.7');
  assert.deepEqual(normalizeFeedFilters(feedFilterQuery(filters)),filters);
  assert.deepEqual(normalizeFeedFilters({period:'yesterday',tab:['amigos'],minRating:'6',maxRating:'4.25',sort:'sql'}),FEED_DEFAULTS);
  assert.deepEqual([normalizeFeedFilters({minRating:'4.7',maxRating:'0'}).minRating,normalizeFeedFilters({minRating:'4.7',maxRating:'0'}).maxRating],['0','4.7']);
  assert.equal(activeFeedFilters(filters).length,7);assert.deepEqual(feedFilterQuery(FEED_DEFAULTS),{});
});
test('single aggregate RPC passes normalized filters, anchor, cursor and abort signal without per-card queries',async()=>{
  const calls=[],controller=new AbortController(),cursor={scope:'cursor'},anchor='2026-10-27T10:00:00Z';
  const client=createClient('https://void.test','public-test-key',{global:{fetch:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({rows:[{rating:0}],total:1}),{status:200,headers:{'content-type':'application/json'}});}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const result=await loadReviewsFeed(client,{filters:{tab:'amigos',minRating:'0'},cursor,anchor,seenAt:anchor,signal:controller.signal});
  assert.equal(result.rows[0].rating,0);assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('/rpc/void_reviews_feed'));
  assert.deepEqual(JSON.parse(calls[0].options.body),{media:'jogos',filters:{...FEED_DEFAULTS,tab:'amigos'},after_cursor:cursor,as_of:anchor,seen_at:anchor});assert.equal(calls[0].options.signal,controller.signal);
  assert.deepEqual(result.top_games,[]);assert.deepEqual(result.friends_playing,[]);await assert.rejects(loadReviewsFeed(client,{media:'unknown'}));assert.equal(calls.length,1);
});
test('errors stay errors rather than silently presenting an empty feed',async()=>{
  const client=createClient('https://void.test','public-test-key',{global:{fetch:async()=>new Response(JSON.stringify({message:'permission denied'}),{status:403,headers:{'content-type':'application/json'}})},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  await assert.rejects(loadReviewsFeed(client));await assert.rejects(loadReviewsFeed(null));
});
test('cursor append deduplicates the same review without dropping distinct authors and visit keys isolate accounts and tabs',()=>{
  assert.deepEqual(mergeFeedRows([{user_id:'a',item_key:'jogos:1',rating:0}],[{user_id:'a',item_key:'jogos:1',rating:4},{user_id:'b',item_key:'jogos:1',rating:2}]).map(row=>row.rating),[4,2]);
  assert.notEqual(feedVisitKey('a','amigos'),feedVisitKey('b','amigos'));assert.notEqual(feedVisitKey('a','amigos'),feedVisitKey('a','comunidade'));assert.notEqual(feedVisitKey(null,'amigos'),feedVisitKey('a','amigos'));
  assert.notEqual(feedVisitKey('a','amigos','series'),feedVisitKey('a','amigos','jogos'));
  assert.equal(feedVisitKey('a','comunidade'),feedVisitKey('a','comunidade','jogos'));
});

test('series feed uses the shared RPC with series scope and preserves zero, friends, cursor and failures',async()=>{
  const calls=[],controller=new AbortController(),cursor={scope:'series-cursor'},anchor='2026-11-01T12:00:00Z';
  let fail=false;
  const client=createClient('https://void.test','public-test-key',{global:{fetch:async(url,options)=>{
    calls.push({url,options});
    return new Response(JSON.stringify(fail?{message:'permission denied'}:{rows:[{user_id:'friend',item_key:'series:1396',rating:0}],has_more:true,cursor}),{status:fail?403:200,headers:{'content-type':'application/json'}});
  }},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const result=await loadReviewsFeed(client,{media:'series',filters:{tab:'amigos',q:'Breaking Bad',minRating:'0',maxRating:'4.7',text:'with'},cursor,anchor,signal:controller.signal});
  assert.equal(result.rows[0].rating,0);assert.equal(result.rows[0].item_key,'series:1396');assert.equal(result.has_more,true);
  assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('/rpc/void_reviews_feed'));
  assert.deepEqual(JSON.parse(calls[0].options.body),{media:'series',filters:{...FEED_DEFAULTS,tab:'amigos',q:'Breaking Bad',maxRating:'4.7',text:'with'},after_cursor:cursor,as_of:anchor,seen_at:null});
  assert.equal(calls[0].options.signal,controller.signal);
  fail=true;await assert.rejects(loadReviewsFeed(client,{media:'series',filters:{tab:'amigos'}}));assert.equal(calls.length,2);
});
test('author status is an explicit review snapshot and never inferred from a private library or Steam',()=>{
  const now=new Date('2026-10-27T10:00:00Z'),item={id:1,categoria:'jogos',titulo:'Jogo',estreia:'2020-01-01'};
  assert.equal(reviewFeedContext({},'finished',now).status,null);
  assert.equal(reviewFeedContext(null,'finished',now).status,null);
  assert.equal(reviewFeedContext({share_status:true},'not-valid',now).status,null);
  const form=gameReviewForm(null,true,now);form.nota=0;
  const normal=completeGameReview(item,null,form,true,now);assert.equal(normal.feed_context.status,null);assert.equal(normal.nota,0);
  form.feed_context={share_status:true,status:'finished',platform:'PC'};
  const published=completeGameReview(item,null,form,true,now);assert.equal(published.feed_context.status,'finished');assert.equal(published.feed_context.marked_at,now.toISOString());assert.equal(gameReviewForm(published,true,now).feed_context.status,'finished');
  form.feed_context.share_status=false;const cleared=completeGameReview(item,published,form,true,now);assert.equal(cleared.feed_context.status,null);assert.equal(cleared.feed_context.marked_at,null);
});
test('game interactions lead to game community without changing movie notification destinations',()=>{
  const row={entity_type:'review',entity_id:'person/jogos:123',data:{comment_id:'comment'}};
  assert.equal(notificationHref(row),'/obra/jogos/123#comunidade');
  assert.equal(notificationHref({...row,entity_id:'person/filmes:123'}),'/filme/123?tab=reviews&review=person&comments=1');
});
