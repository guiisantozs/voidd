import test from 'node:test';
import assert from 'node:assert/strict';
import {annualActivity,diaryGroups,activityPresentation,profileReviewHref,contentError,profileComments,profileContentPage} from '../lib/profile-content.js';

test('annual heatmap preserves leap day, uses consumption counts and aligns Monday first',()=>{
 const cells=annualActivity(2024,[{day:'2024-02-29',total:3}]);assert.equal(cells.length,366);assert.equal(cells.find(day=>day?.date==='2024-02-29').total,3);assert.equal(cells[0].date,'2024-01-01');
 const sunday=annualActivity(2023);assert.equal(sunday.slice(0,6).every(day=>day===null),true);assert.equal(sunday[6].date,'2023-01-01');assert.throws(()=>annualActivity(2024.2));
});
test('diary groups months without mutating chronological entries or their zero ratings',()=>{
 const rows=[{consumed_on:'2024-03-01',payload:{nota:0}},{consumed_on:'2024-02-29'},{consumed_on:'2024-02-28'}];const copy=JSON.stringify(rows),groups=diaryGroups(rows);
 assert.deepEqual(groups.map(group=>[group.month,group.entries.length]),[['2024-03',1],['2024-02',2]]);assert.equal(groups[0].entries[0].payload.nota,0);assert.equal(JSON.stringify(rows),copy);
});
test('activity uses current source links and handles server achievement events without raw HTML',()=>{
 assert.equal(activityPresentation({type:'list_add',data:{list_id:'id',list_title:'Minha lista',item:{titulo:'Filme'}}}).href,'/listas/id');
 assert.match(profileReviewHref({categoria:'filmes',id:42},'owner'),/tab=reviews&review=owner/);
 assert.match(activityPresentation({type:'achievement',data:{title:'Primeiro filme'}}).text,/Primeiro filme/);
 assert.equal(activityPresentation({type:'follow',data:{profile_id:'id',username:'ana'}}).href,'/u/ana');
 assert.match(contentError({message:'RATE_LIMIT'}),/5 recados/);assert.ok(!contentError({message:'upstream-secret'}).includes('secret'));
});
test('wall reads are scoped, ordered, paginated and hydrate only minimal identities',async()=>{
 const calls=[],query={select(...args){calls.push(['select',...args]);return this;},eq(...args){calls.push(['eq',...args]);return this;},order(...args){calls.push(['order',...args]);return this;},range(...args){calls.push(['range',...args]);return this;},then(resolve){return Promise.resolve({data:[{id:'one',user_id:'author',body:'Oi'}],count:21}).then(resolve);}};
 const result=await profileComments({from:table=>{assert.equal(table,'profile_comments');return query;},rpc:async(name,args)=>{assert.equal(name,'void_identities');assert.deepEqual(args.ids,['author']);return {data:[{user_id:'author',username:'ana'}]};}},'profile',20);
 assert.ok(calls.some(call=>call.join(':')==='eq:profile_id:profile'));assert.ok(calls.some(call=>call.join(':')==='range:20:39'));assert.equal(result.rows[0].username,'ana');assert.equal(result.total,21);
});
test('profile RPC keeps target/year/page and propagates authorization errors',async()=>{
 const target='10000000-0000-4000-8000-000000000001';
 const client={rpc:async(name,args)=>{assert.equal(name,'void_profile_diary_page');assert.equal(args.activity_year,2024);return {error:new Error('denied')};}};
 await assert.rejects(profileContentPage(client,'void_profile_diary_page',{target,activity_year:2024,page_offset:0}),/denied/);
 await assert.rejects(profileContentPage(client,'void_profile_diary_page',{target:'wrong'}),/INVALID/);
});
