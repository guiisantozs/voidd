import {requestIGDB} from './igdb-client.js';
import {publicGameCache} from './game-public-cache.js';
import {igdbGameId,decodeIGDBGameId} from './game-provider.js';
import {gameUniverses} from '../game-universes.config.js';
import curated from '../game-trending.config.js';
import {editorialGames} from './games.js';
import {legacySteamLinks,verifiedLegacyLinks} from '../config/game-provider-links.js';
import {SEARCH_CACHE_MS} from './catalog-cache-policy.js';

export const IGDB_CATALOG_FIELDS='name,slug,summary,first_release_date,total_rating,total_rating_count,follows,hypes,cover.image_id,cover.width,cover.height,artworks.image_id,artworks.width,artworks.height,screenshots.image_id,screenshots.width,screenshots.height,genres.name,platforms.name,websites.url,involved_companies.developer,involved_companies.publisher,involved_companies.company.name,similar_games,collections';
const imageId=id=>/^[-a-zA-Z0-9_]+$/.test(id||'');
const image=(id,size)=>imageId(id)?`https://images.igdb.com/igdb/image/upload/t_${size}/${id}.jpg`:null;
const titleKey=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const mapped=new Map([...verifiedLegacyLinks,...gameUniverses.flatMap(u=>Object.entries(u.rawgIds||{}).map(([igdb,rawg])=>[Number(igdb),Number(rawg)]))]);
const known=[...curated.map(g=>({id:g.id,title:g.igdbName||g.title,company:g.igdbCompany})),...editorialGames.map(g=>({id:g.id,title:g.titulo,year:Number(g.ano)}))];
const genreIds={action:[4,5,25,33],adventure:[31], 'role-playing-games-rpg':[12],strategy:[15,24,26],shooter:[5],puzzle:[9],racing:[10],sports:[14],indie:[32]};
const platforms={PC:[6],PlayStation:[7,8,9,38,46,48,167],Xbox:[11,12,49,169],Nintendo:[4,5,18,19,20,21,22,24,33,37,41,130,508]};
export function igdbIdentity(row){
 return mapped.get(row.id)||igdbGameId(row.id);
}
export function normalizeIGDBGame(row,identity=igdbIdentity(row)){
 const date=Number.isFinite(row.first_release_date)?new Date(row.first_release_date*1000).toISOString().slice(0,10):null;
 const cover=row.cover;
 const art=[...(row.artworks||[]),...(row.screenshots||[])].filter(a=>imageId(a.image_id)&&a.width>=1280&&a.height>=600&&a.width/a.height>=1.35).sort((a,b)=>b.width*b.height-a.width*a.height)[0];
 const sourceUrl=`https://www.igdb.com/games/${encodeURIComponent(row.slug||'')}`;
 const officialCover=imageId(cover?.image_id)?{url:image(cover.image_id,'cover_big_2x'),source:'IGDB',sourceUrl,...(cover.width&&cover.height?{width:cover.width,height:cover.height}:{}),...(art?{heroArtwork:{url:image(art.image_id,'1080p_2x'),source:'IGDB',width:art.width,height:art.height,portrait:false}}:{})}:null;
 const names=type=>[...new Set((row.involved_companies||[]).filter(c=>c[type]).map(c=>c.company?.name).filter(Boolean))].join(' · ');
 const stores=(row.websites||[]).flatMap(w=>{try{const u=new URL(w.url);return u.protocol==='https:'&&['store.steampowered.com','store.playstation.com','www.xbox.com','www.nintendo.com','www.gog.com','store.epicgames.com'].includes(u.hostname)?[{url:u.href}]:[];}catch{return [];}});
 const steam=stores.map(s=>s.url.match(/^https:\/\/store\.steampowered\.com\/app\/([1-9]\d*)/)?.[1]).find(Boolean);
 return {id:identity,catalogProvider:'IGDB',igdbId:row.id,...(Number(identity)<9000000000?{rawgId:Number(identity)}:{}),categoria:'jogos',titulo:row.name,poster:officialCover?.url||null,officialCover,backdrop:art?image(art.image_id,'1080p_2x'):null,
  estreia:date,ano:date?.slice(0,4)||'',sinopse:row.summary||'',nota:row.total_rating_count>0&&Number.isFinite(row.total_rating)?Math.max(0,Math.min(5,row.total_rating/20)):null,
  catalogVotes:row.total_rating_count||0,catalogAdded:(row.total_rating_count||0)+(row.follows||0)+(row.hypes||0),generos:(row.genres||[]).map(g=>g.name),plataformas:(row.platforms||[]).map(p=>p.name),
  screenshots:(row.screenshots||[]).map(a=>image(a.image_id,'1080p')).filter(Boolean),stores,...(steam?{steamAppId:steam}:{}),similarIds:row.similar_games||[],creditos:[],
  informacoes:[{label:'Plataformas',valor:(row.platforms||[]).map(p=>p.name).join(' · ')},{label:'Desenvolvimento',valor:names('developer')},{label:'Publicação',valor:names('publisher')}].filter(i=>i.valor),fonte:'IGDB',fonteUrl:sourceUrl};
}
export function createIGDBCatalog({request=requestIGDB,cache=publicGameCache}={}){
 let aliases;
 async function prepareAliases(){
  if(!aliases)aliases=cache('legacy-steam-crosswalk-v1',async()=>{
   const source=await request('external_game_sources','fields name; where name = "Steam"; limit 2;');
   if(source.length!==1)throw Error('IGDB_STEAM_SOURCE');
   const links=await request('external_games',`fields uid,game; where external_game_source = ${source[0].id} & uid = (${legacySteamLinks.map(g=>JSON.stringify(g.steam_id)).join(',')}); limit 500;`);
   const pairs=[];
   for(const old of legacySteamLinks){const ids=[...new Set(links.filter(r=>r.uid===old.steam_id).map(r=>r.game))];if(ids.length===1&&Number.isInteger(ids[0]))pairs.push([ids[0],old.rawg_id]);}
   return pairs.filter(([id,rawg])=>!pairs.some(([otherId,otherRawg])=>(id===otherId&&rawg!==otherRawg)||(rawg===otherRawg&&id!==otherId)));
  }).catch(error=>{aliases=null;throw error;});
  const pairs=await aliases;for(const [id,rawg] of pairs)if(!mapped.has(id)||mapped.get(id)===rawg)mapped.set(id,rawg);
 }
 const query=(body,options)=>cache(body,()=>request('games',body),options);
 async function rows(body,options){await prepareAliases();const result=await query(body,options);return result.filter(r=>Number.isInteger(r.id)&&r.id>0&&r.name).map(r=>normalizeIGDBGame(r));}
 async function detail(id){
  await prepareAliases();
  const direct=decodeIGDBGameId(id),fixed=[...mapped].find(([,rawg])=>String(rawg)===String(id))?.[0];
  let result;
  if(direct||fixed)result=await rows(`fields ${IGDB_CATALOG_FIELDS}; where id=${direct||fixed}; limit 1;`);
  else{
   const entry=known.find(g=>String(g.id)===String(id));
   if(!entry)throw Object.assign(Error('CATALOG_ID_UNMAPPED'),{status:404});
   result=(await rows(`search ${JSON.stringify(entry.title)}; fields ${IGDB_CATALOG_FIELDS}; limit 20;`)).filter(g=>titleKey(g.titulo)===titleKey(entry.title)&&(!entry.year||Number(g.ano)===entry.year)&&(!entry.company||g.informacoes.some(i=>titleKey(i.valor).startsWith(titleKey(entry.company)))));
  }
  if(result.length!==1)throw Object.assign(Error('GAME_NOT_FOUND'),{status:404});
  return {...result[0],id:Number(id),...(!decodeIGDBGameId(id)?{rawgId:Number(id)}:{})};
 }
 async function search(options){
  if(options.tag||options.developer||options.publisher)throw Error('PROVIDER_FILTER_UNAVAILABLE');
  const conditions=['cover != null','version_parent = null','game_type = (0,4,8,9,10,11)'];
  if(options.platform&&options.platform!=='all')conditions.push(`platforms = (${platforms[options.platform].join(',')})`);
  if(options.genre&&options.genre!=='all')conditions.push(`genres = (${genreIds[options.genre].join(',')})`);
  if(options.year)conditions.push(`first_release_date >= ${Date.parse(options.year+'-01-01')/1000} & first_release_date < ${Date.parse((+options.year+1)+'-01-01')/1000}`);
  if(options.releasedFrom&&options.releasedTo)conditions.push(`first_release_date >= ${Date.parse(options.releasedFrom)/1000} & first_release_date <= ${Date.parse(options.releasedTo)/1000+86399}`);
  if(Number.isFinite(options.minVotes))conditions.push(`total_rating_count >= ${options.minVotes}`);
  if(Number.isFinite(options.minRating))conditions.push(`total_rating >= ${options.minRating*20}`);
  const prefix=options.q?`search ${JSON.stringify(options.q)}; `:'';
  const sort=options.q?'':`sort ${{rating:'total_rating',year:'first_release_date',popular:'total_rating_count'}[options.order||'popular']} desc; `;
  const body=`${prefix}fields ${IGDB_CATALOG_FIELDS}; where ${conditions.join(' & ')}; ${sort}limit 19; offset ${((options.page||1)-1)*18};`;
  // IGDB's count endpoint does not support full-text search. Never present a
  // different name-filter count as the number of fuzzy search matches.
  if(options.q){const games=await rows(body,{ttl:SEARCH_CACHE_MS,stale:0,persist:false});return {jogos:games.slice(0,18),pagination:{page:options.page||1,pageSize:18,total:((options.page||1)-1)*18+games.length,hasNext:games.length>18},source:'IGDB',totalIsLowerBound:true};}
  await prepareAliases();
  const result=await cache('search:'+body,()=>request('multiquery',`query games "items" { ${body} }; query games/count "total" { ${prefix}where ${conditions.join(' & ')}; };`),{ttl:SEARCH_CACHE_MS,stale:0});
  const values=result.find(r=>r.name==='items')?.result;
  const total=result.find(r=>r.name==='total')?.count;
  if(!Array.isArray(values)||!Number.isInteger(total)||total<0)throw Error('IGDB_INVALID_SEARCH');
  const games=values.map(row=>normalizeIGDBGame(row));
  return {jogos:games.slice(0,18),pagination:{page:options.page||1,pageSize:18,total,hasNext:games.length>18},source:'IGDB'};
 }
 async function highlights({now=new Date(),mode='hype',page=1}={}){
  const day=86400,today=Math.floor(+now/(day*1000))*day,from=today+(mode==='upcoming'?1:mode==='recent'?-30:-365)*day,to=mode==='recent'?today+day-1:today+180*day;
  const order=mode==='upcoming'?'first_release_date asc':mode==='recent'?'first_release_date desc':'total_rating_count desc';
  const games=await rows(`fields ${IGDB_CATALOG_FIELDS}; where cover != null & (artworks != null | screenshots != null) & version_parent = null & game_type = (0,4,8,9,10,11) & first_release_date >= ${from} & first_release_date <= ${to} & (total_rating_count >= 5 | follows >= 10 | hypes >= 10); sort ${order}; limit 40; offset ${(page-1)*40};`);
  return {games:games.filter(g=>g.backdrop).slice(0,mode==='recent'?12:40),hasNext:games.length===40,basis:{source:'IGDB',from:new Date(from*1000).toISOString().slice(0,10),to:new Date(to*1000).toISOString().slice(0,10),ordering:order}};
 }
 async function similar(id){const seed=await detail(id);if(!seed.similarIds.length)return {games:[],partial:false};return {games:await rows(`fields ${IGDB_CATALOG_FIELDS}; where id = (${seed.similarIds.slice(0,12).filter(Number.isInteger).join(',')}) & cover != null; limit 8;`),partial:false};}
 return {search,detail,highlights,similar};
}
export const igdbCatalog=createIGDBCatalog();
