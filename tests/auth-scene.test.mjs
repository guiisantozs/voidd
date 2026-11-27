import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTH_SCENE_TTL, authPosters, clearAuthSceneCache, configuredAuthProviders } from '../lib/auth-scene.js';
import { AUTH_SUCCESS_KEY, authSuccessPending, consumeAuthSuccess, KONAMI, konamiStep, markAuthSuccess } from '../lib/auth-experience.js';
import handler from '../pages/api/auth-scene.js';

function setup(t) {
  const fetch = globalThis.fetch;
  const names = ['TMDB_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
  const env = names.map(name => process.env[name]);
  process.env.TMDB_API_KEY = 'test-key'; process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.test'; process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-public';
  clearAuthSceneCache();
  t.after(() => { globalThis.fetch = fetch; clearAuthSceneCache(); names.forEach((name, index) => { if (env[index] === undefined) delete process.env[name]; else process.env[name] = env[index]; }); });
}
const response = () => ({ headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
test('auth posters share requests, filter unsafe/decorative data and expire after 6h', async t => {
  setup(t); let calls = 0;
  globalThis.fetch = async input => {
    calls++; const url = new URL(input); assert.equal(url.pathname,'/3/trending/all/week'); assert.equal(url.searchParams.get('language'),'pt-BR');
    return {ok:true,json:async()=>({results:[...Array.from({length:25},(_,id)=>({media_type:'movie',poster_path:`/poster${id}.jpg`})),{media_type:'person',poster_path:'/person.jpg'},{media_type:'tv',adult:true,poster_path:'/adult.jpg'},{media_type:'movie',poster_path:'https://tracker.test/image.jpg'}]})};
  };
  const [a,b] = await Promise.all([authPosters(0),authPosters(0)]);
  assert.equal(calls,1); assert.equal(a.length,20); assert.deepEqual(a,b); assert.ok(a.every(src=>src.startsWith('https://image.tmdb.org/t/p/w185/')));
  await authPosters(AUTH_SCENE_TTL-1);assert.equal(calls,1);
  await authPosters(AUTH_SCENE_TTL);assert.equal(calls,2);
});
test('social buttons require explicitly enabled providers and omit other settings', async t => {
  setup(t); globalThis.fetch = async()=>({ok:true,json:async()=>({external:{google:true,discord:false,github:true},secret:'not-returned'})});
  assert.deepEqual(await configuredAuthProviders(),['google']);
});
test('scene endpoint gracefully returns gradients-only data on upstream failure and rejects POST', async t => {
  setup(t); let calls=0; globalThis.fetch=async()=>{calls++;throw Error('private upstream failure');};
  const denied=response();await handler({method:'POST'},denied);assert.equal(denied.code,405);assert.equal(calls,0);
  const result=response();await handler({method:'GET'},result);assert.deepEqual(result.body,{posters:[],providers:[]});assert.ok(!JSON.stringify(result.body).includes('private'));
});
test('success handoff survives remount once, excludes recovery/other users and expires', () => {
  const data=new Map();const storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
  const user={id:'player'}; markAuthSuccess(storage,user,1000);
  assert.equal(authSuccessPending(storage,user,false,2000),true);assert.equal(authSuccessPending(storage,user,false,2000),true);
  assert.equal(authSuccessPending(storage,{id:'other'},false,2000),false);assert.equal(authSuccessPending(storage,user,true,2000),false);
  assert.equal(consumeAuthSuccess(storage,user,false,2000),true);assert.equal(consumeAuthSuccess(storage,user,false,2000),false);
  markAuthSuccess(storage,user,0);assert.equal(authSuccessPending(storage,user,false,300000),false);
  storage.setItem(AUTH_SUCCESS_KEY,'broken');assert.equal(consumeAuthSuccess(storage,user,false),false);
});
test('Konami accepts letter casing and resets after a wrong key', () => {
  let index=0; for(const key of KONAMI) index=konamiStep(index,key.toLowerCase()==='b'?'B':key);
  assert.equal(index,KONAMI.length);assert.equal(konamiStep(4,'x'),0);assert.equal(konamiStep(4,'ArrowUp'),1);
});
test('Konami ignores missing or malformed keys without crashing or losing progress', () => {
  for (const index of [0, 4, 8]) {
    for (const key of [undefined, null, '', 13, {}]) assert.equal(konamiStep(index, key), index);
  }
  let index = 0;
  for (const key of KONAMI) { index = konamiStep(index, undefined); index = konamiStep(index, key); }
  assert.equal(index, KONAMI.length);
});
