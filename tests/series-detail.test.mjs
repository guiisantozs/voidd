import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSeriesDetail,getSeriesDetail,getSeriesSeason,getSeriesProviders,getSeriesRecentEpisodes} from '../lib/series-detail.js';
import {nextUnratedEpisode,unitReleased,unitKey,seasonPersonalAverage} from '../lib/series-units.js';
import {writeSeriesUnit} from '../lib/series-unit-server.js';
import {validSeriesHighlights,missingHighlightsColumn} from '../lib/series-review-highlights.js';
import {clearSeriesCache} from '../lib/series-catalog.js';
import {saveReviewRecord} from '../lib/review-save.js';
process.env.TMDB_API_KEY='test-only';
const raw={id:1396,name:'Uma série',original_name:'A Series',first_air_date:'2020-01-01',last_air_date:'2022-01-01',status:'Ended',poster_path:'/poster.jpg',backdrop_path:'/backdrop.jpg',vote_count:2000,vote_average:8.4,genres:[{id:18,name:'Drama'}],origin_country:['US'],number_of_seasons:2,number_of_episodes:20,seasons:[{id:0,season_number:0,name:'Especiais',air_date:'2020-01-01',episode_count:3},{id:1,season_number:1,name:'Temporada 1',air_date:'2020-01-01',episode_count:10},{id:2,season_number:2,name:'Temporada 2',air_date:'2021-01-01',episode_count:10}],created_by:[{name:'Pessoa criadora'}],networks:[{name:'Rede'}],credits:{cast:[{id:1,name:'Pessoa',character:'Personagem',profile_path:'/person.jpg'}],crew:[]},content_ratings:{results:[{iso_3166_1:'BR',rating:'16'}]},videos:{results:[{site:'YouTube',key:'abcdefghijk',type:'Trailer',official:true}]},last_episode_to_air:{id:10,season_number:2,episode_number:10,name:'Último',air_date:'2026-10-29'},next_episode_to_air:{id:11,season_number:3,episode_number:1,name:'Próximo',air_date:'2026-11-01'}};
test('series detail reuses /5 source facts, BR certification, creators, networks and complete season identity with specials last',()=>{
 const item=normalizeSeriesDetail(raw);assert.equal(item.categoria,'series');assert.equal(item.nota,4.2);assert.equal(item.tmdbRating,8.4);assert.equal(item.classificacao,'16');assert.equal(item.yearRange,'2020–2022');assert.deepEqual(item.seasons.map(row=>row.seasonNumber),[1,2,0]);assert.equal(item.elenco[0].papel,'Personagem');assert(item.informacoes.some(row=>row.label==='Criação'&&row.valor==='Pessoa criadora'));assert(item.informacoes.some(row=>row.label==='Próximo episódio'&&row.valor.includes('2026-11-01')));assert.equal(normalizeSeriesDetail({...raw,genres:[{id:16}],origin_country:['JP']}).isAnime,true);
});
test('details, season and provider requests deduplicate concurrent calls and preserve authoritative episode dates',async()=>{
 clearSeriesCache();const urls=[],fetcher=async url=>{urls.push(url);if(url.pathname.endsWith('/providers'))return {results:{BR:{link:'https://www.themoviedb.org/tv/1396/watch?locale=BR',flatrate:[{provider_id:8,provider_name:'Netflix',logo_path:'/logo.jpg'},{provider_id:8,provider_name:'Netflix',logo_path:'/logo.jpg'}]}}};if(url.pathname.includes('/season/'))return {...raw.seasons[1],episodes:[raw.last_episode_to_air,raw.next_episode_to_air]};return raw;};
 const [first,second]=await Promise.all([getSeriesDetail('1396',{fetcher}),getSeriesDetail('1396',{fetcher})]);assert.equal(urls.length,1);assert.deepEqual(first,second);
 const [providers,again]=await Promise.all([getSeriesProviders('1396','BR',{fetcher}),getSeriesProviders('1396','BR',{fetcher})]);assert.equal(urls.length,2);assert.equal(providers.groups.length,1);assert.equal(providers.groups[0].providers.length,1);assert.deepEqual(providers,again);assert.equal((await getSeriesProviders('1396','PT',{fetcher})).groups.length,0);assert.equal(urls.length,2);
 const season=await getSeriesSeason('1396',2,{fetcher});assert.equal(season.episodes[0].airDate,'2026-10-29');assert.equal(season.episodes[1].airDate,'2026-11-01');assert.equal(urls.length,3);await assert.rejects(getSeriesSeason('1396',-1,{fetcher}),/INVALID/);await assert.rejects(getSeriesProviders('1396','invalid',{fetcher}),/INVALID/);
});
test('recent digest uses compact metadata once, retains the latest episode and never expands seasons or fetches videos',async()=>{
 clearSeriesCache();const now=new Date('2026-10-30T12:00:00Z'),paths=[],fetcher=async url=>{paths.push(url.pathname);return raw;};
 const digest=await getSeriesRecentEpisodes('1396',{fetcher,now});assert.equal(digest.episodes.length,1);const target=digest.episodes[0];assert.equal(target.episodeNumber,10);assert.equal(unitKey(target),'2:10');assert.equal(unitReleased({...target,airDate:null},now),false);assert.equal(unitReleased({...target,airDate:'2026-11-01'},now),false);assert.equal(seasonPersonalAverage({'1:0':{nota:0},'2:0':{nota:4},'1:1':{nota:5}}),2);assert.deepEqual(paths,['/3/tv/1396']);
});
function database(){const writes=[];return {writes,client:{from:table=>{const query={upsert:async (value,options)=>{writes.push({table,value,options});return {error:null};},delete:()=>{const filters=[];const action={eq:(...args)=>{filters.push(args);return action;},then:resolve=>{writes.push({table,filters});return resolve({error:null});}};return action;}};return query;}}};}
test('unit writes preserve one canonical owner/target and zero, validate release facts and delete without provider dependencies',async()=>{
 const reader=database(),admin=database(),unit={seriesId:1396,seasonNumber:1,episodeNumber:1,name:'Episódio',airDate:'2020-01-01'},options={reader:reader.client,admin:admin.client,owner:'caller',detail:async()=>({isAnime:false}),season:async()=>({episodes:[unit]})};
 const body={operation:'review',seriesId:1396,seasonNumber:1,episodeNumber:1,user_id:'forged',form:{rating:0,text:'Comentário',date:'2020-01-01',public:false,spoiler:true}};await writeSeriesUnit({...options,body});assert.equal(reader.writes[0].value.user_id,'caller');assert.equal(reader.writes[0].value.rating,0);assert.equal(reader.writes[0].value.is_public,false);assert.equal(admin.writes[0].value.air_date,'2020-01-01');
 await assert.rejects(writeSeriesUnit({...options,body:{...body,form:{...body.form,rating:5.1}}}),/INVALID/);await assert.rejects(writeSeriesUnit({...options,body,season:async()=>({episodes:[{...unit,airDate:'2099-01-01'}]})}),/UNRELEASED/);await assert.rejects(writeSeriesUnit({...options,body,season:async()=>({episodes:[]})}),/UNRELEASED/);
 await assert.rejects(writeSeriesUnit({...options,body,season:async()=>({episodes:[{...unit,seasonNumber:2}]})}),/UNRELEASED/);await assert.rejects(writeSeriesUnit({...options,body,season:async()=>({episodes:[{...unit,seriesId:999}]})}),/UNRELEASED/);
 await writeSeriesUnit({...options,body:{...body,operation:'watch'}});assert.equal(reader.writes.at(-1).table,'void_series_episode_progress');await writeSeriesUnit({...options,body:{...body,operation:'remove'},detail:async()=>{throw Error('offline');}});assert(reader.writes.at(-1).filters.some(([key,value])=>key==='user_id'&&value==='caller'));
});

test('optional highlights preserve legacy writes, accept only distinct known keys and remain separate from watched progress',async()=>{
 const reader=database(),admin=database(),unit={seriesId:1396,seasonNumber:1,episodeNumber:1,name:'Episódio',airDate:'2020-01-01'},options={reader:reader.client,admin:admin.client,owner:'caller',detail:async()=>({isAnime:false}),season:async()=>({episodes:[unit]})};
 const form={rating:0,text:'Review',date:'2020-01-01',public:false,spoiler:true},body={operation:'review',seriesId:1396,seasonNumber:1,episodeNumber:1,form};
 await writeSeriesUnit({...options,body});assert.equal(Object.hasOwn(reader.writes.at(-1).value,'highlights'),false);
 await writeSeriesUnit({...options,body:{...body,form:{...form,highlights:['roteiro','personagens']}}});
 assert.deepEqual(reader.writes.at(-1).value.highlights,['roteiro','personagens']);assert.equal(reader.writes.at(-1).value.rating,0);assert.equal(reader.writes.at(-1).value.is_public,false);
 await writeSeriesUnit({...options,body:{...body,form:{...form,highlights:[]}}});assert.deepEqual(reader.writes.at(-1).value.highlights,[]);
 for(const highlights of [['inventado'],['roteiro','roteiro'],'roteiro',null])await assert.rejects(writeSeriesUnit({...options,body:{...body,form:{...form,highlights}}}),/INVALID/);
 await writeSeriesUnit({...options,body:{...body,operation:'watch',form:{...form,highlights:['roteiro']}}});assert.equal(reader.writes.at(-1).table,'void_series_episode_progress');assert.equal(Object.hasOwn(reader.writes.at(-1).value,'highlights'),false);
 assert.equal(validSeriesHighlights(['roteiro','atuacao','trilha-sonora','direcao','fotografia','final','ritmo','personagens']),true);
 assert.equal(missingHighlightsColumn({code:'42703',message:'column highlights does not exist'}),true);
 assert.equal(missingHighlightsColumn({code:'PGRST204',message:'highlights not found in schema cache'}),true);
 assert.equal(missingHighlightsColumn({code:'42501',message:'permission denied'}),false);
 assert.equal(missingHighlightsColumn({code:'42703',message:'column rating does not exist'}),false);
});
test('episode edits reuse the unique owner/series/season/episode conflict key and never write a general series review',async()=>{
 const reader=database(),admin=database(),unit={seriesId:1396,seasonNumber:2,episodeNumber:5,name:'Episode',airDate:'2020-01-01'};
 const body={operation:'review',seriesId:1396,seasonNumber:2,episodeNumber:5,form:{rating:4.2,text:'Review',date:'2020-01-01',public:false,spoiler:false}};
 const options={reader:reader.client,admin:admin.client,owner:'caller',body,detail:async()=>({isAnime:false}),season:async()=>({episodes:[unit]})};
 await writeSeriesUnit(options);await writeSeriesUnit({...options,body:{...body,form:{...body.form,rating:0}}});
 assert(reader.writes.every(row=>row.table==='void_series_unit_reviews'&&row.options.onConflict==='user_id,series_id,season_number,episode_number'));
 assert.equal(reader.writes.at(-1).value.rating,0);assert.equal(reader.writes.at(-1).value.user_id,'caller');
 await assert.rejects(writeSeriesUnit({...options,body:{...body,media:'filmes'}}),/INVALID/);
 await assert.rejects(writeSeriesUnit({...options,body:{...body,media:'animes'}}),/INVALID/);
 await writeSeriesUnit({...options,body:{...body,media:'animes'},detail:async()=>({isAnime:true})});assert.equal(reader.writes.at(-1).table,'void_series_unit_reviews');
});
test('whole-series review persistence keeps a bounded snapshot without storing full episode/credit payloads',()=>{
 const memory=new Map(),storage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)},item={...normalizeSeriesDetail(raw),elenco:Array.from({length:1000},()=>({nome:'Pessoa',biografia:'x'.repeat(1000)}))};
 const result=saveReviewRecord({storage,item,form:{nota:0,texto:'Uma opinião',data:'2020-01-01',public:false},signedIn:true,now:new Date('2026-10-30T12:00:00Z')});assert.equal(result.record.nota,0);assert.equal(result.record.public,false);assert.equal(result.record.item.id,1396);assert.equal(result.record.item.categoria,'series');assert(memory.get('void:reviews:v1').length<10000);
});
