import test from 'node:test';
import assert from 'node:assert/strict';
import {createIGDBCoverClient} from '../lib/igdb-covers.js';
const credentials=()=>({id:'fixture-id',secret:'fixture-secret'});
const row={name:'Example',slug:'example',cover:{image_id:'co123'},first_release_date:Date.parse('2026-10-01')/1000};
const response=(body,status=200)=>({ok:status===200,status,json:async()=>body});
test('curated provider aliases resolve the official sequel and Valve game without accepting namesakes',async()=>{
 const names=[];const find=createIGDBCoverClient({request:async(endpoint,body)=>{names.push(body);return [{...row,name:'Deadlock',slug:'deadlock-2016',involved_companies:[{company:{name:'Other Studio'}}]},{...row,name:'Deadlock',slug:'deadlock-valve',involved_companies:[{company:{name:'Valve'}}]}];}});
 const result=await find({id:998676,name:'Deadlock (Valve)'});assert.match(result.sourceUrl,/deadlock-valve$/);assert.match(names[0],/^search "Deadlock";/);
 const sequel=createIGDBCoverClient({request:async(endpoint,body)=>{assert.match(body,/Slay the Spire II/);return [{...row,name:'Slay the Spire II',involved_companies:[{company:{name:'Mega Crit Games'}}]}];}});assert.ok(await sequel({id:994601,name:'Slay the Spire 2',released:'2026-03-01'}));
});
test('hero artwork uses high-resolution artwork metadata and never promotes small covers to a background',async()=>{
  const find=createIGDBCoverClient({credentials,interval:0,fetcher:async url=>url.includes('oauth2')?response({access_token:'fixture',expires_in:3600}):response([{...row,artworks:[{image_id:'art1',width:3840,height:2160}]}])});
  assert.equal((await find({name:'Example'})).heroArtwork.url,'https://images.igdb.com/igdb/image/upload/t_1080p_2x/art1.jpg');
  const small=createIGDBCoverClient({credentials,interval:0,fetcher:async url=>url.includes('oauth2')?response({access_token:'fixture',expires_in:3600}):response([{...row,cover:{image_id:'small',width:264,height:374}}])});
  assert.equal((await small({name:'Example'})).heroArtwork,undefined);
});
test('RAWG release-year suffixes match IGDB without conflating editions or release years',async()=>{
  const find=createIGDBCoverClient({credentials,interval:0,fetcher:async(url,options)=>{
    if(url.includes('oauth2'))return response({access_token:'fixture',expires_in:3600});
    assert.ok(options.body.startsWith('search "Example";'));
    return response([row,{...row,first_release_date:Date.parse('1998-01-01')/1000}]);
  }});
  assert.equal((await find({name:'Example (2026)'})).source,'IGDB');
  assert.equal(await find({name:'Example (2010)'}),null);
});
test('IGDB keeps credentials in server requests, reuses a token and returns cover metadata only',async()=>{
  let auth=0,queries=0;
  const find=createIGDBCoverClient({credentials,interval:0,fetcher:async(url,options)=>{
    if(url.includes('oauth2')){auth++;assert.equal(options.body.get('client_secret'),'fixture-secret');return response({access_token:'fixture-token',expires_in:3600});}
    queries++;assert.equal(options.headers.Authorization,'Bearer fixture-token');return response([row]);
  }});
  const cover=await find({name:'Example',released:'2026-10-29'});
  assert.equal(cover.source,'IGDB');assert.ok(cover.url.endsWith('/co123.jpg'));
  assert.equal(JSON.stringify(cover).includes('fixture'),false);
  await find({name:'Example'});assert.equal(auth,1);assert.equal(queries,2);
});
test('IGDB rejects ambiguous titles, different editions, conflicting years and unsafe image paths',async()=>{
  for(const rows of [[row,row],[{...row,name:'Example Remastered'}],[{...row,first_release_date:Date.parse('1998-01-01')/1000}],[{...row,cover:{image_id:'../../secret'}}]]){
    const find=createIGDBCoverClient({credentials,interval:0,fetcher:async url=>url.includes('oauth2')?response({access_token:'fixture',expires_in:3600}):response(rows)});
    assert.equal(await find({name:'Example',released:'2026-10-29'}),null);
  }
});
test('missing credentials skip requests; expired authorization is renewed once',async()=>{
  const absent=createIGDBCoverClient({credentials:()=>({}),fetcher:()=>{throw Error('unexpected');}});
  await assert.rejects(()=>absent({name:'Example'}),/IGDB_CONFIG/);
  let auth=0,queries=0;
  const find=createIGDBCoverClient({credentials,interval:0,fetcher:async url=>{
    if(url.includes('oauth2')){auth++;return response({access_token:'fixture',expires_in:3600});}
    return ++queries===1?response({},401):response([row]);
  }});
  assert.equal((await find({name:'Example'})).source,'IGDB');assert.equal(auth,2);
});
