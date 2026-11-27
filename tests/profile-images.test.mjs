import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarFileError,avatarObjectName,avatarStoragePath,AVATAR_MAX_BYTES } from '../lib/profile-images.js';
import { movieArtwork,parseArtworkId } from '../lib/profile-artwork.js';
import handler from '../pages/api/profile-banner.js';
import { profileBanner, positionBanner } from '../lib/profile-banner.js';

test('banner framing survives saving in the existing URL without changing the requested image',()=>{
  const source='https://image.tmdb.org/t/p/w1280/scene.jpg';
  const value=positionBanner(source,27,68);
  assert.deepEqual(profileBanner(value),{source,x:27,y:68});
  assert.deepEqual(profileBanner(source),{source,x:50,y:40});
  assert.deepEqual(profileBanner(positionBanner(value,-10,250)),{source,x:0,y:100});
  assert.equal(new URL(value).pathname,new URL(source).pathname);
  assert.equal(positionBanner('javascript:alert(1)',50,40),'');
  assert.deepEqual(profileBanner(''),{source:'',x:50,y:40});
});

test('avatar files reject unsupported types and oversized input; storage references stay on the configured origin',()=>{
  assert.equal(avatarFileError({type:'image/jpeg',size:200}), '');
  for(const file of [{type:'image/svg+xml',size:100},{type:'image/webp',size:AVATAR_MAX_BYTES+1},{type:'image/png',size:0}])assert.ok(avatarFileError(file));
  const user='00000000-0000-4000-8000-000000000001',base='https://test.supabase.co',path=avatarObjectName(user);
  assert.match(path,/^[\da-f-]{36}\/[\da-f-]{36}\.webp$/);
  assert.notEqual(path,avatarObjectName(user));
  const url=`${base}/storage/v1/object/public/profile-avatars/${path}`;
  assert.equal(avatarStoragePath(url,base),path);
  for(const invalid of [url.replace('test.supabase.co','evil.example'),url.replace('profile-avatars','other'),url.replace('.webp','.svg'),'javascript:alert(1)'])assert.equal(avatarStoragePath(invalid,base),'');
});
test('banner artwork validates IDs, normalizes safe images, caches public data, and does not expose upstream errors',async()=>{
  for(const id of [['1'],'0','../1','1?key=x'])assert.throws(()=>parseArtworkId(id));
  const original=global.fetch,key=process.env.TMDB_API_KEY;
  process.env.TMDB_API_KEY='test-only';let calls=0;
  global.fetch=async url=>{calls++;assert.match(String(url),/language=pt-BR/);return new Response(JSON.stringify({id:90210,poster_path:'/cover.jpg',backdrop_path:'/scene.jpg',images:{posters:[{file_path:'/cover.jpg'},{file_path:'https://evil.example/a.jpg'}],backdrops:[{file_path:'/extra.jpg'}]}}),{status:200});};
  try{
    const result=await movieArtwork('90210',100);
    assert.equal(result.images.length,3);
    assert.ok(result.images.every(p=>p.url.startsWith('https://image.tmdb.org/t/p/')));
    await movieArtwork('90210',200);assert.equal(calls,1);
    await movieArtwork('90210',86400200);assert.equal(calls,2);
    const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
    await handler({method:'GET',query:{id:['1']}},res);assert.equal(res.code,400);
    await handler({method:'POST',query:{}},res);assert.equal(res.code,405);
  }finally{global.fetch=original;if(key===undefined)delete process.env.TMDB_API_KEY;else process.env.TMDB_API_KEY=key;}
});
