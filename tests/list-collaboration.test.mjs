import test from 'node:test';
import assert from 'node:assert/strict';
import {collaborationSummary} from '../lib/list-collaboration.js';
import {validateList,writeList} from '../lib/lists.js';
import {notificationHref,notificationText} from '../lib/notifications.js';
const items=[{media_type:'filmes',external_id:'1'},{media_type:'jogos',external_id:'2'}];
const participants=['a','b','c'].map(user_id=>({user_id,status:'accepted'}));
test('collective progress counts unique participant/work pairs and excludes pending members',()=>{
 const data=collaborationSummary(items,{participants:[...participants,{user_id:'d',status:'pending'}],reviews:[{user_id:'a',item_key:'filmes:1',rating:0},{user_id:'a',item_key:'jogos:2',rating:4.7}],progress:[{...items[0],user_id:'a'},{...items[0],user_id:'b'},{...items[0],user_id:'d'}]});
 assert.equal(data.total,6);assert.equal(data.done,3);assert.equal(data.percent,50);assert.equal(data.works[0].average,0);assert.equal(data.works[0].watched,2);assert.equal(data.people[0].completed,2);assert.equal(data.unanimous,0);
});
test('no ratings are invented and private/missing reviews contribute no score',()=>{
 const data=collaborationSummary(items,{participants,progress:[{...items[0],user_id:'a'}]});assert.equal(data.works[0].average,null);assert.equal(data.works[0].watched,1);assert.equal(data.works[0].participants[1].rating,null);
 assert.equal(collaborationSummary([],{}).percent,0);assert.equal(collaborationSummary(items,{}).unanimous,0);
 const all=collaborationSummary([items[0]],{participants,reviews:participants.map(p=>({user_id:p.user_id,item_key:'filmes:1',rating:4.5}))});assert.equal(all.percent,100);assert.equal(all.unanimous,1);
});
test('collaboration is independent of visibility and list invites navigate to acceptance',()=>{
 const form={title:'Grupo',description:'',ranked:false,visibility:'private',collaboration_enabled:true};assert.equal(validateList(form).collaboration_enabled,true);assert.equal(validateList({...form,visibility:'public'}).visibility,'public');assert.throws(()=>validateList({...form,collaboration_enabled:'true'}));assert.equal(notificationHref({type:'list_invite',entity_id:'abc'}),'/listas/convites?lista=abc');assert.match(notificationText({type:'list_invite',data:{actor_name:'Gui'}}),/Gui convidou/);
});
test('cover and collaboration metadata use the versioned write API without altering entries',async()=>{
 let request;const client={rpc:async(name,args)=>{request={name,args};return {data:'list-id'};}};
 await writeList(client,'list-id',{title:'Grupo',description:'',ranked:false,visibility:'private',collaboration_enabled:true,cover_key:'filmes:1'},undefined,'version');
 assert.equal(request.name,'void_list_write_v3');assert.equal(request.args.metadata.cover_key,'filmes:1');assert.equal(request.args.entries,null);assert.equal(request.args.expected_version,'version');
});
