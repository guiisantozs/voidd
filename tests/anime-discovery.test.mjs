import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnimeDiscovery} from '../lib/anime-discovery.js';
import {localizedAnimeQuery} from '../config/anime-discovery.js';
import {createAnimeArtwork} from '../lib/anime-artwork.js';
import {searchAnime} from '../lib/anime-catalog.js';
const edition=()=>({hero:Array.from({length:5},(_,id)=>({id:id+1})),weekly:[{id:6}],trending:[{id:7}],artworkVersion:3});
test('five hero entries and coordinated sections reuse one edition, deduplicate and expire every six hours',async()=>{
 let calls=0,now=0;const client=createAnimeDiscovery({clock:()=>now,load:async()=>{calls++;return edition();},enrich:async data=>data});
 const [a,b]=await Promise.all([client.section('editorial'),client.section('trending')]);assert.equal(calls,1);assert.equal(a.hero.length,5);assert.equal(b.movies[0].id,7);a.hero.pop();assert.equal((await client.section('hero')).movies.length,5);assert.equal((await client.section('weekly')).movies[0].id,6);now=21600001;await client.section('editorial');assert.equal(calls,2);
});
test('temporary failures retain five last-good slides with bounded stale time and backoff',async()=>{
 let now=0,calls=0;const client=createAnimeDiscovery({clock:()=>now,load:async()=>{calls++;if(calls>1)throw Error('offline');return edition();},enrich:async data=>data});
 await client.section('editorial');now=21600001;const stale=await client.section('editorial');assert.equal(stale.hero.length,5);assert.equal(stale.stale,true);await client.section('editorial');assert.equal(calls,2);now+=86400001;await assert.rejects(client.section('editorial'));await assert.rejects(client.section('editorial'));
});
test('a valid refresh with fewer eligible candidates never pads vacancies with old titles',async()=>{
 let now=0,calls=0;const client=createAnimeDiscovery({clock:()=>now,load:async()=>{calls++;const data=edition();if(calls>1)data.hero.pop();return data;},enrich:async data=>data});await client.section('editorial');now=21600001;const data=await client.section('editorial');assert.equal(data.hero.length,4);assert.equal(data.stale,undefined);
 await assert.rejects(client.section('unknown'));await assert.rejects(client.section('trending',0));
});
test('last good is revalidated when observations expire, and diagnostics no longer claim a removed title was selected',async()=>{
 const start=Date.parse('2026-11-04T12:00:00Z');let now=start,calls=0;
 const anime={id:9000000001,categoria:'animes',titulo:'Current',estreia:'2026-10-25',brazilAvailable:true,trendSignals:{status:'RELEASING',observedAt:start,trending:300,daily:Array.from({length:16},(_,i)=>({date:start/1000-i*86400,trending:500,releasing:false}))}};
 const client=createAnimeDiscovery({clock:()=>now,enrich:async data=>data,load:async()=>{if(calls++)throw Error('offline');return {hero:[anime],weekly:[],trending:[],diagnostics:[{id:anime.id,selected:'hero'}]};}});
 await client.section('editorial');now=start+13*3600000;
 const data=await client.section('editorial');assert.equal(data.stale,true);assert.equal(data.hero.length,0);
 const [diagnostic]=await client.diagnostics();assert.equal(diagnostic.selected,'none');assert.ok(diagnostic.reasons.includes('last-good-no-longer-eligible'));
});
test('development diagnostics stay outside public production responses without touching sources',async t=>{
 const previous=process.env.NODE_ENV;process.env.NODE_ENV='production';t.after(()=>{if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;});
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('NETWORK_TOUCHED');});
 const {default:handler}=await import('../pages/api/animes/[section].js');
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},end(){}};
 await handler({method:'GET',query:{section:'diagnostics'}},res);assert.equal(res.code,404);assert.equal(res.headers['Cache-Control'],'private, no-store');assert.equal(calls,0);
});
test('TMDB discovery resolves Crunchyroll provider dynamically and applies Brazil to every shared page',async()=>{
 const calls=[],anime={id:9000000021,titulo:'One Piece',ano:'1999',format:'TV'},tv={id:37854,name:'One Piece',first_air_date:'1999-10-20',genre_ids:[16],original_language:'ja',popularity:123,poster_path:'/a.jpg'};
 const client=createAnimeArtwork({resource:async(path,params)=>{calls.push({path,params});return path==='watch/providers/tv'?{results:[{provider_id:777,provider_name:'Crunchyroll'}]}:{results:path==='discover/tv'&&params.page===1?[tv]:[]};}});
 const [item]=await client.items([anime]);assert.equal(item.crunchyrollBrazil,true);assert.equal(item.discoveryPopularity,123);assert.equal(calls.length,5);for(const call of calls.slice(1)){assert.equal(call.params.watch_region,'BR');assert.equal(call.params.with_watch_providers,777);assert.equal(call.params.with_genres,16);assert.equal(call.params.with_original_language,'ja');}
});
test('Portuguese anime aliases improve search without changing filters or ordinary queries',async()=>{
 assert.equal(localizedAnimeQuery('Diários de uma Apotecária'),'Kusuriya no Hitorigoto');assert.equal(localizedAnimeQuery('Frieren e a Jornada para o Além'),'Sousou no Frieren');assert.equal(localizedAnimeQuery('Outro anime'),'Outro anime');
 let query;await searchAnime({q:'Diários de uma Apotecária',genre:'1',year:'2023'},{resource:async(path,params)=>{query=params;return {data:[]};}});assert.equal(query.q,'kusuriya no hitorigoto');assert.equal(query.genres,'1');assert.equal(query.start_date,'2023-01-01');
});
