import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RESERVED_USERNAMES,normalizeUsername,usernameValid,suggestUsername,profileHref,withIdentities,usernameError } from '../lib/usernames.js';
test('usernames enforce separators, length, lowercase and reserved names consistently with SQL',()=>{
 for(const value of ['gui','gui.santos','gui_santos','a1b','a'.repeat(20)])assert.ok(usernameValid(value),value);
 for(const value of ['ab','a'.repeat(21),'.abc','abc_','gui..santos','gui__santos','gui._santos','Gui','gui santos','gui-santos','joão','@gui',...RESERVED_USERNAMES])assert.equal(usernameValid(value),false,value);
 const sql=fs.readFileSync(new URL('../supabase/migrations/20261021114441_required_usernames.sql',import.meta.url),'utf8');
 for(const name of RESERVED_USERNAMES)assert.ok(sql.includes(`'${name}'`),name);
 assert.equal(normalizeUsername(' @Gui.Santos '),'gui.santos');assert.equal(normalizeUsername(['gui']),'');
});
test('suggestions never expose a full email, and routes keep existing UUID links usable',()=>{
 for(const name of ['Gui Santos','João da Silva','á','admin','   ','pessoa@example.invalid','Nome muito longo de uma pessoa'])for(let n=0;n<10;n++){const candidate=suggestUsername(name,n);assert.ok(usernameValid(candidate),candidate);assert.ok(!candidate.includes('@'));}
 assert.equal(profileHref({username:'gui.santos',user_id:'id'}),'/u/gui.santos');assert.equal(profileHref('id'),'/pessoas/id');assert.equal(profileHref({username:null,user_id:'id'}),'/pessoas/id');
 assert.match(usernameError({code:'23505'}),/já está em uso/);assert.match(usernameError({message:'USERNAME_COOLDOWN'}),/30 dias/);
});
test('identities are fetched in a bounded batch and existing review fields are preserved',async()=>{
 let calls=0;const client={rpc:async(name,args)=>{calls++;assert.equal(name,'void_identities');assert.deepEqual(args.ids,['a','b']);return {data:[{user_id:'a',username:'pessoa.a',display_name:'Pessoa',avatar_url:''}]};}};
 const rows=await withIdentities(client,[{user_id:'a',rating:8},{user_id:'b',text:'Review'},{user_id:'a',rating:9}]);assert.equal(calls,1);assert.equal(rows[0].rating,8);assert.equal(rows[2].username,'pessoa.a');assert.equal(rows[1].text,'Review');
});
