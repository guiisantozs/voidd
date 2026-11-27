import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { listIdeas,seasonalIdeas } from '../list-ideas.config.js';
import { cleanListText,listEntry,listItemKey,listsPage,moveListItem,readList,setListItem,validateList,writeList } from '../lib/lists.js';
const id='11111111-1111-4111-8111-111111111111';
const form={title:'Minha lista',description:'Uma escolha pessoal',visibility:'private',ranked:true};
const movie={id:123,categoria:'filmes',titulo:'Filme real do resultado',poster:'https://image.tmdb.org/t/p/w342/test.jpg',ano:'2026'};
const sdk=fetch=>createClient('https://void.test','public-test-key',{global:{fetch},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});

test('twenty editable ideas contain inspiration only, and seasonal order uses Brazilian calendar',()=>{
  assert.equal(listIdeas.length,20);assert.equal(new Set(listIdeas.map(i=>i.id)).size,20);
  for(const idea of listIdeas){assert.ok(idea.title.length<=80&&idea.description.length<=500);assert.equal(idea.items,undefined);assert.equal(idea.external_id,undefined);assert.equal(idea.icon,undefined);assert.ok(idea.theme);}
  assert.equal(seasonalIdeas(new Date('2026-10-21T12:00:00Z'))[0].id,'halloween');
  assert.equal(seasonalIdeas(new Date('2026-12-01T03:00:00Z'))[0].id,'natal');
  assert.equal(seasonalIdeas(new Date('2026-12-01T01:00:00Z')).find(i=>i.id==='natal').inSeason,false);
  assert.equal(listIdeas[0].inSeason,undefined);
});
test('list metadata and text enforce bounds, reject invalid visibility/rank and render plain text',()=>{
  assert.equal(cleanListText(' <b>Olá</b>\u0001 '),'Olá');assert.equal(validateList(form,[]).visibility,'private');
  assert.equal(validateList({...form,title:'x'.repeat(80),description:'x'.repeat(500)},[]).title.length,80);
  for(const bad of [{title:''},{title:'x'.repeat(81)},{description:'x'.repeat(501)},{visibility:'everyone'},{ranked:'yes'}])assert.throws(()=>validateList({...form,...bad},[]));
});
test('mixed media preserves provider identity, sanitizes snapshots and rejects duplicate/over-limit works',()=>{
  const film=listEntry(movie),show=listEntry({...movie,categoria:'series'});
  assert.notEqual(listItemKey(film),listItemKey(show));assert.doesNotThrow(()=>validateList(form,[film,show]));
  assert.throws(()=>validateList(form,[film,film]));assert.throws(()=>listEntry({...movie,id:'12/34'}));assert.throws(()=>listEntry({...movie,categoria:'livros'}));
  const rows=Array.from({length:200},(_,i)=>listEntry({...movie,id:i+1}));assert.doesNotThrow(()=>validateList(form,rows));assert.throws(()=>validateList(form,[...rows,listEntry({...movie,id:201})]));
  assert.throws(()=>validateList(form,[{...film,note:'x'.repeat(201)}]));
  assert.equal(listEntry({...movie,poster:'javascript:alert(1)',titulo:'<b>Título</b>'}).snapshot.poster,'');
  assert.equal(listEntry({...movie,titulo:'<b>Título</b>'}).snapshot.titulo,'Título');
});
test('moving items preserves note/snapshot, order and the original array for keyboard and drag operations',()=>{
  const items=[listEntry(movie,'Primeira'),listEntry({...movie,id:456},'Segunda')];const next=moveListItem(items,1,0);
  assert.equal(next[0].note,'Segunda');assert.equal(items[0].note,'Primeira');assert.equal(moveListItem(items,-1,0),items);
});
test('list pages and details use one RPC per page with account-filtered modes and server covers',async()=>{
  const requests=[],client=sdk(async(url,options)=>{requests.push({url:String(url),body:JSON.parse(options.body)});return response({rows:[{id,cover:[movie],item_count:1}],has_more:true});});
  const page=await listsPage(client,{mode:'profile',owner:id,sort:'popular',page:2});assert.equal(page.rows[0].cover[0].id,movie.id);assert.equal(requests.length,1);
  assert.deepEqual(requests[0].body,{section:'profile',ordering:'popular',target:id,page_number:2,media_filter:null});
  await readList(client,id);assert.match(requests[1].url,/void_list_detail$/);assert.deepEqual(requests[1].body,{target:id});
  await assert.rejects(listsPage(client,{mode:'admin'}));await assert.rejects(listsPage(client,{page:-1}));await assert.rejects(readList(client,'../bad'));
});
test('creating an idea sends zero works; editor sends a version and quick add uses atomic toggle',async()=>{
  const requests=[],client=sdk(async(url,options)=>{requests.push({url:String(url),body:JSON.parse(options.body)});return response(id);});
  await writeList(client,null,{...form,title:listIdeas[0].title,description:listIdeas[0].description},[]);
  assert.deepEqual(requests[0].body.entries,[]);assert.equal(requests[0].body.target,null);assert.equal(requests[0].body.metadata.visibility,'private');
  const version='2026-10-21T12:00:00.123456Z';await writeList(client,id,form,[listEntry(movie)],version);assert.equal(requests[1].body.expected_version,version);
  await setListItem(client,id,movie,true);assert.match(requests[2].url,/void_list_item_toggle$/);assert.equal(requests[2].body.present,true);assert.equal(requests[2].body.entry.external_id,'123');
  const denied=sdk(async()=>response({message:'LIST_CONFLICT',code:'P0001'},400));await assert.rejects(writeList(denied,id,form,[],version));await assert.rejects(listsPage(denied));
});

test('categories accept one or several supported types and preserve legacy forms without categories',()=>{
 for(const types of [['filmes'],['series','animes'],['filmes','series','jogos','animes']])assert.deepEqual(validateList({...form,media_types:types},[]).media_types,types);
 for(const types of [[],['livros'],['filmes','filmes'],null,'filmes'])assert.throws(()=>validateList({...form,media_types:types},[]));
 assert.equal(validateList(form,[]).media_types,undefined);
});
test('media filters are sent to the paginated RPC, and invalid filters never reach the network',async()=>{
 let calls=0;const client=sdk(async(url,options)=>{calls++;assert.match(String(url),/void_lists_page_v2$/);assert.equal(JSON.parse(options.body).media_filter,'jogos');return response({rows:[],has_more:false});});
 await listsPage(client,{mode:'profile',owner:id,media:'jogos'});assert.equal(calls,1);await assert.rejects(listsPage(client,{media:'livros'}));assert.equal(calls,1);
});
