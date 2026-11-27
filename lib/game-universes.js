import { fetchJson } from './api.js';
import { normalizeGame } from './game-search.js';
import { requestIGDB } from './igdb-client.js';
import { gameUniverseBySlug, gameUniverses } from '../game-universes.config.js';
import { releaseOrder } from './game-universe-model.js';
import {useIGDBCatalog,igdbGameId} from './game-provider.js';
export { universeGroups, releaseOrder } from './game-universe-model.js';

// Confirmed against /game_types and current IGDB documentation, 2026-10-26.
export const OFFICIAL_GAME_TYPES = [0,4,8,9,10,11];
export const normalizeUniverseTitle = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s*\((?:19|20)\d{2}\)\s*$/,'').replace(/[^a-z0-9]+/g,' ').trim();
const ref = value => typeof value === 'object' ? value?.id : value;
const year = seconds => Number.isFinite(seconds) ? new Date(seconds*1000).getUTCFullYear() : null;
const imageId = value => /^[-a-zA-Z0-9_]+$/.test(value || '');

export function officialUniverseDecision(row, universe) {
  if (!Number.isInteger(row?.id) || universe.denylist.includes(row.id)) return 'denylist';
  if (row.version_parent) return 'edition';
  if ([2,3,6,7].includes(ref(row.game_status))) return 'unreleased-state';
  if (!(row.collections || []).some(collection => universe.collectionIds.includes(ref(collection))) && !universe.allowlist.includes(row.id) && !universe.spinOffIds.includes(row.id)) return 'unrelated';
  if (!universe.allowlist.includes(row.id) && !OFFICIAL_GAME_TYPES.includes(ref(row.game_type))) return 'type';
  if (!(row.involved_companies || []).some(company => (company.developer || company.publisher) && universe.officialStudios.includes(ref(company.company)))) return 'studio';
  if (!imageId(row.cover?.image_id)) return 'cover';
  if (/\b(?:demo|beta|trailer|game jam|level (?:design|project)|interactive poster)\b|\(itch\)/i.test(row.name || '')) return 'non-game';
  return 'official';
}
export function gameUniverseGroup(row, universe) {
  if ([8,9,10,11].includes(ref(row.game_type))) return 'remasters';
  if (universe.allowlist.includes(row.id) || universe.spinOffIds.includes(row.id) || ref(row.game_type) === 4 || (row.collections||[]).some(collection=>(universe.spinOffCollectionIds||[]).includes(ref(collection)))) return 'spinoffs';
  return 'main';
}
export function belongsToGameUniverse(item, universe) {
  const name = normalizeUniverseTitle(item?.name);
  return Number.isInteger(item?.id) && item.id > 0 && (name === universe.family || name.startsWith(`${universe.family} `));
}
async function mapLimit(items, fn, limit=3) {
  const result=new Array(items.length);let next=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{for(;;){const index=next++;if(index>=items.length)return;result[index]=await fn(items[index]);}}));
  return result;
}
const fields = 'name,slug,summary,genres.name,game_type.type,game_status.status,first_release_date,parent_game,version_parent,cover.image_id,cover.width,cover.height,artworks.image_id,screenshots.image_id,involved_companies.developer,involved_companies.publisher,involved_companies.company.name,involved_companies.company.slug,platforms.name,platforms.platform_family.name,collections.name';

export function createGameUniverseLoader({ request=requestIGDB, fetcher=fetchJson, key=()=>process.env.RAWG_API_KEY, now=Date.now }={}) {
  const cache=new Map(),pending=new Map();
  async function rawg(path,params={}) {
    const apiKey=key();if(!apiKey||apiKey==='cole_sua_chave_aqui')throw Error('CONFIG');
    const url=new URL(`https://api.rawg.io/api/${path}`);url.search=new URLSearchParams({key:apiKey,...params});
    return fetcher(url);
  }
  async function rawgCandidates(universe) {
    if(useIGDBCatalog()&&fetcher===fetchJson)return {rows:[],partial:false};
    const rows=[];let partial=false;
    for(let page=1;page<=5;page++){
      try{
        const data=await rawg('games',{search:universe.query,search_precise:'true',search_exact:'true',ordering:'released',page_size:'40',page:String(page)});
        if(!Array.isArray(data.results))throw Error('SOURCE');
        rows.push(...data.results.filter(row=>belongsToGameUniverse(row,universe)));
        if(!data.next&&!(Number(data.count)>page*40))break;
        if(page===5)partial=true;
      }catch{partial=true;break;}
    }
    return {rows,partial};
  }
  return async function load(slug) {
    const universe=gameUniverseBySlug(slug);if(!universe)throw Error('NOT_FOUND');
    const saved=cache.get(slug);if(saved&&saved.expires>now())return saved.data;
    if(pending.has(slug))return pending.get(slug);
    const task=(async()=>{
      const exceptions=[...new Set([...universe.allowlist,...universe.spinOffIds])];
      const where=`collections=(${universe.collectionIds.join(',')})${exceptions.length?` | id=(${exceptions.join(',')})`:''}`;
      const [igdb,rawgResult]=await Promise.all([request('games',`fields ${fields}; where ${where}; limit 500;`),rawgCandidates(universe)]);
      if(!Array.isArray(igdb))throw Error('IGDB_UNAVAILABLE');
      const decisions=igdb.map(row=>({row,reason:officialUniverseDecision(row,universe)}));
      const selected=decisions.filter(entry=>entry.reason==='official').map(entry=>entry.row);
      const available=new Map(rawgResult.rows.map(row=>[row.id,row]));
      const used=new Set();
      const games=await mapLimit(selected,async row=>{
        let rawgId=universe.rawgIds[row.id] || null;
        // Keep the established RAWG identity. Never use an IGDB ID in a RAWG route.
        if(!rawgId&&(!useIGDBCatalog()||fetcher!==fetchJson)){
          const matchesTitle=candidate=>normalizeUniverseTitle(candidate.name)===normalizeUniverseTitle(row.name)&&(!candidate.released||!year(row.first_release_date)||Math.abs(Number(candidate.released.slice(0,4))-year(row.first_release_date))<=1);
          let matches=rawgResult.rows.filter(matchesTitle);
          if(!matches.length){
            try{const result=await rawg('games',{search:row.name,search_precise:'true',search_exact:'true',page_size:'20'});matches=(result.results||[]).filter(matchesTitle);}catch{ /* The internal catalogue detail remains available. */ }
          }
          if(matches.length===1){
            try{
              const detail=await rawg(`games/${matches[0].id}`);
              const companies=[...(detail.developers||[]),...(detail.publishers||[])].map(company=>normalizeUniverseTitle(company.name));
              const officialNames=(row.involved_companies||[]).filter(company=>company.developer||company.publisher).map(company=>normalizeUniverseTitle(company.company?.name));
              if(Number.isInteger(detail.id)&&detail.id===matches[0].id&&companies.some(name=>officialNames.some(official=>name===official)))rawgId=detail.id;
            }catch{ /* Keep this edition's separate internal catalogue detail. */ }
          }
        }
        if(rawgId)used.add(rawgId);
        const type=ref(row.game_type),name=row.name;
        const platforms=[...new Set((row.platforms||[]).map(platform=>platform.name))];
        const date=Number.isFinite(row.first_release_date)?new Date(row.first_release_date*1000).toISOString().slice(0,10):null;
        const artwork=row.artworks?.find(image=>imageId(image.image_id)) || row.screenshots?.find(image=>imageId(image.image_id));
        return {id:rawgId||(useIGDBCatalog()&&fetcher===fetchJson?igdbGameId(row.id):null),igdbId:row.id,categoria:'jogos',titulo:name,ano:date?.slice(0,4)||'',estreia:date,plataformas:platforms,generos:(row.genres||[]).map(genre=>genre.name).filter(Boolean),sinopse:typeof row.summary==='string'?row.summary.slice(0,12000):'',
          screenshots:(row.screenshots||[]).filter(image=>imageId(image.image_id)).slice(0,12).map(image=>`https://images.igdb.com/igdb/image/upload/t_1080p/${image.image_id}.jpg`),
          informacoes:[['Desenvolvimento','developer'],['Publicação','publisher']].flatMap(([label,key])=>{const names=[...new Set((row.involved_companies||[]).filter(company=>company[key]).map(company=>company.company?.name).filter(Boolean))];return names.length?[{label,valor:names.join(' · ')}]:[];}),nota:available.get(rawgId)?.ratings_count>0?available.get(rawgId).rating:null,
          gameType:type,group:gameUniverseGroup(row,universe),official:true,fonte:'IGDB',fonteUrl:`https://www.igdb.com/games/${encodeURIComponent(row.slug)}`,
          officialCover:{url:`https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${row.cover.image_id}.jpg`,source:'IGDB'},
          backdrop:artwork?`https://images.igdb.com/igdb/image/upload/t_1080p/${artwork.image_id}.jpg`:null};
      });
      const unique=new Map();
      for(const game of games){
        const identity=`${normalizeUniverseTitle(game.titulo)}|${game.gameType}|${game.ano}`;
        if(!unique.has(identity))unique.set(identity,game);
        else unique.get(identity).plataformas=[...new Set([...unique.get(identity).plataformas,...game.plataformas])];
      }
      const official=[...unique.values()].sort(releaseOrder);
      // A port/remaster absent from RAWG must not borrow another edition's
      // identity/status. Prefer the explicitly verified crosswalk, then unlink
      // ambiguous duplicates while retaining their own internal catalogue page.
      const owners=new Map();
      for(const game of [...official].sort((a,b)=>Number(!!universe.rawgIds[b.igdbId])-Number(!!universe.rawgIds[a.igdbId]))){
        if(!game.id)continue;
        if(owners.has(game.id))game.id=null;else owners.set(game.id,game.igdbId);
      }
      const officialTitles=new Set(official.map(game=>normalizeUniverseTitle(game.titulo)));
      const extras=[...new Map(rawgResult.rows.filter(row=>!used.has(row.id)&&!universe.rawgDenylist.includes(row.id)&&!officialTitles.has(normalizeUniverseTitle(row.name))).map(row=>[row.id,{...normalizeGame(row),official:false,entryKind:universe.rawgExtras.includes(row.id)?'extra':'community'}])).values()];
      const years=official.map(game=>Number(game.ano)).filter(value=>value>0);
      const data={slug,games:official,extras,total:official.length,partial:rawgResult.partial||igdb.length===500,
        backdrop:official.find(game=>game.backdrop)?.backdrop||null,
        facts:{firstYear:years.length?Math.min(...years):null,lastYear:years.length?Math.max(...years):null,platforms:[...new Set(official.flatMap(game=>game.plataformas))],studio:universe.mainStudio},
        audit:{source:'IGDB collections',removed:decisions.filter(entry=>entry.reason!=='official').map(({row,reason})=>({id:row.id,title:row.name,reason})),community:extras.map(game=>({id:game.id,title:game.titulo}))}};
      cache.set(slug,{data,expires:now()+(data.partial?60000:3600000)});return data;
    })().finally(()=>pending.delete(slug));
    pending.set(slug,task);return task;
  };
}
export const loadGameUniverse=createGameUniverseLoader();
export async function gameUniverseDetailProps(params, {load=loadGameUniverse}={}) {
  const universe=gameUniverseBySlug(params?.slug),id=params?.gameId;
  if(!universe||typeof id!=='string'||! /^[1-9]\d{0,9}$/.test(id))return {notFound:true};
  try {
    const data=await load(universe.slug),item=data.games.find(game=>game.official&&String(game.igdbId)===id);
    if(!item)return {notFound:true};
    if(item.id)return {redirect:{destination:`/obra/jogos/${item.id}`,permanent:false}};
    return {props:{universe,item,error:false}};
  }catch{return {props:{universe,item:null,error:true}};}
}
export async function loadGameUniverseIndex(){return Promise.all(gameUniverses.map(async universe=>{try{const data=await loadGameUniverse(universe.slug);return {slug:universe.slug,total:data.total,facts:data.facts,backdrop:data.backdrop};}catch{return {slug:universe.slug,error:true};}}));}
