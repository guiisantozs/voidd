process.env.ANIME_CATALOG_PROVIDER='jikan';
process.env.JIKAN_API_BASE_URL='https://fixture-jikan.invalid/v4';
// Explicitly exercise the retained RAWG adapter; IGDB has its own fixtures.
process.env.GAME_CATALOG_PROVIDER = 'rawg';
import test from 'node:test';
import assert from 'node:assert/strict';
import { moveFavorite,profileFormValid,safeProfileImage,profileIdValid,favoriteSnapshot,mediaGradient } from '../lib/profile.js';
import { parseProfileSearch,searchProfileMedia } from '../lib/profile-search.js';
import handler from '../pages/api/profile-media-search.js';
import {clearAnimeCache} from '../lib/anime-catalog.js';

test('favorite reorder preserves distinct items and does not mutate the saved snapshot',()=>{
 const items=[{id:1},{id:2},{id:3}];assert.deepEqual(moveFavorite(items,0,2).map(p=>p.id),[2,3,1]);assert.deepEqual(items.map(p=>p.id),[1,2,3]);
 assert.equal(moveFavorite(items,null,1),items);assert.equal(moveFavorite(items,3,0),items);
 assert.deepEqual(favoriteSnapshot({id:2,categoria:'filmes',titulo:'Filme',poster:'javascript:alert(1)',elenco:[1]}),{id:2,categoria:'filmes',titulo:'Filme',poster:'',ano:''});
});
test('profile fields reject unsafe images, malformed handles and invalid visibility',()=>{
 const form={display_name:'Pessoa',username:'pessoa_1',bio:'Olá',visibility:'private',avatar_url:'',banner_url:''};assert.ok(profileFormValid(form));
 for(const patch of [{username:'A B'},{display_name:' '},{bio:'x'.repeat(241)},{visibility:'friends'},{avatar_url:'data:image/svg+xml,hello'},{banner_url:'http://example.com/a.jpg'}])assert.equal(!!profileFormValid({...form,...patch}),false);
 assert.equal(safeProfileImage('https://example.com/a.jpg'),'https://example.com/a.jpg');assert.equal(safeProfileImage('javascript:alert(1)'),'');assert.equal(profileIdValid(['bad']),false);
 assert.equal(mediaGradient([]),'#2b2335');assert.match(mediaGradient([{media:'filmes',total:1}]),/100%/);
});
test('profile search validates repeated parameters and unsupported media before accessing providers',async()=>{
 for(const input of [{media:'livros'},{media:['filmes']},{media:'filmes',q:['abc']},{media:'series',q:'x'.repeat(81)}])assert.throws(()=>parseProfileSearch(input),/INVALID/);
 const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
 await handler({method:'GET',query:{media:'livros'}},res);assert.equal(res.code,400);
 await handler({method:'POST',query:{}},res);assert.equal(res.code,405);
});
test('existing game selection remains usable without RAWG and includes an explicit notice',async()=>{
 const original=process.env.RAWG_API_KEY;delete process.env.RAWG_API_KEY;
 try{const data=await searchProfileMedia({media:'jogos',q:'Skyrim'},1000);assert.ok(data.items.some(p=>p.titulo.includes('Skyrim')));assert.match(data.notice,/RAWG/);assert.ok(data.items.every(p=>p.categoria==='jogos'));}
 finally{if(original===undefined)delete process.env.RAWG_API_KEY;else process.env.RAWG_API_KEY=original;}
});
test('anime selectors use Jikan and cache public metadata for five minutes',async t=>{
 clearAnimeCache();let calls=0,now=2000;t.mock.method(Date,'now',()=>now);
 t.mock.method(globalThis,'fetch',async input=>{calls++;const url=new URL(input);assert.equal(url.hostname,'fixture-jikan.invalid');assert.equal(url.searchParams.get('q'),'naruto');return {ok:true,json:async()=>({data:[{mal_id:1,title:'Naruto',images:{jpg:{image_url:'https://fixture.invalid/a.jpg'}}}]})};});
 const first=await searchProfileMedia({media:'animes',q:'Naruto'},2000);assert.deepEqual(first.items.map(p=>p.id),[9000000001]);assert.equal(first.items[0].provider,'jikan');
 await searchProfileMedia({media:'animes',q:'Naruto'},3000);assert.equal(calls,1);now=302001;await searchProfileMedia({media:'animes',q:'Naruto'},now);assert.equal(calls,2);
});
