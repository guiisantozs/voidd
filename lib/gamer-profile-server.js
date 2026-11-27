import { getWork } from './details.js';
import { loadGameOverviewPart } from './game-overview-source.js';
import { steamAppId } from './game-collection.js';
import { collectionAppearanceChoice, gamerArtOptions, safeGamerArtwork } from './gamer-profile.js';
import {decodeIGDBGameId} from './game-provider.js';

export function createGamerMediaSource({ work = getWork, stores = loadGameOverviewPart, now = Date.now } = {}) {
  const cache = new Map();
  async function details(id) {
    if (!/^[1-9][0-9]{0,9}$/.test(String(id))) throw Error('INVALID');
    const key = 'game:'+id, previous = cache.get(key);
    if (previous?.expires>now()) return previous.task;
    if(cache.size>200)cache.delete(cache.keys().next().value);
    const task = work('jogos',String(id)).then(game=>({source:decodeIGDBGameId(id)?'catalog':'rawg',id:String(id),rawg_id:decodeIGDBGameId(id)?null:Number(id),...(decodeIGDBGameId(id)?{catalog_id:Number(id)}:{}),...(game.officialCover?{officialCover:game.officialCover}:{}),collection_id:null,title:game.titulo,cover_url:safeGamerArtwork(game.poster),rawg_background:safeGamerArtwork(game.backdrop||game.poster),rawg_additional:safeGamerArtwork(game.backdrop),genres:game.generos||[],tags:(game.overviewFacts?.tags||[]).map(tag=>tag.name)})).catch(error=>{cache.delete(key);throw error;});
    cache.set(key,{task,expires:now()+3600000});return task;
  }
  async function media(id) {
    const game = await details(id);
    let appid = null;
    try { const links=await stores(String(id),'stores');const ids=[...new Set(links.map(store=>steamAppId(store.url)).filter(Boolean))];if(ids.length===1)appid=ids[0]; } catch { /* RAWG images remain usable without store links. */ }
    const item = {...game,steam_appid:appid};return {...item,artworks:gamerArtOptions(item)};
  }
  return {details,media};
}
export const gamerMediaSource = createGamerMediaSource();

export async function resolveGamerAppearance(client, actor, field, selection, { source = gamerMediaSource } = {}) {
  if (!['banner','favorite'].includes(field)) throw Error('INVALID');
  if (selection === null) return null;
  if (!selection || !['rawg','catalog','collection'].includes(selection.source) || typeof selection.id !== 'string') throw Error('INVALID');
  let game;
  if (selection.source === 'rawg'||selection.source==='catalog') {
    if(!/^[1-9][0-9]{0,9}$/.test(selection.id))throw Error('INVALID');
    game = await source.media(selection.id);
  } else {
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(selection.id))throw Error('INVALID');
    const {data,error}=await client.from('void_game_activity').select('provider,external_id,platform_game:void_game_platform_ids!inner(game_id,game:void_collection_games(*))').eq('user_id',actor).eq('platform_game.game_id',selection.id).limit(5);
    if(error)throw Error('COLLECTION_UNAVAILABLE');
    if(!data?.length)throw Error('INVALID');
    const row=data.find(row=>row.provider==='steam')||data[0];
    game=collectionAppearanceChoice({...row.platform_game.game,platforms:data});
    if(game.rawg_id)try{const full=await source.details(game.rawg_id);game={...full,...game,rawg_background:full.rawg_background,rawg_additional:full.rawg_additional,genres:full.genres,tags:full.tags};}catch{/* Stored catalogue snapshots and Steam artwork remain available. */}
  }
  const snapshot={source:game.source,id:game.id,collection_id:game.collection_id||null,rawg_id:game.rawg_id||null,...(game.catalog_id?{catalog_id:game.catalog_id}:{}),...(game.officialCover?{officialCover:game.officialCover}:{}),title:String(game.title||'Jogo').slice(0,250),cover_url:safeGamerArtwork(game.cover_url),steam_appid:game.steam_appid||null,genres:(game.genres||[]).slice(0,12),rawg_background:safeGamerArtwork(game.rawg_background),rawg_additional:safeGamerArtwork(game.rawg_additional)};
  if(field==='favorite')return snapshot;
  const art=gamerArtOptions(game).find(art=>art.variant===selection.variant);
  if(!art)throw Error('INVALID');
  const coordinate = (value,fallback)=>Number.isInteger(value)&&value>=0&&value<=100?value:fallback;
  return {...snapshot,url:art.url,variant:art.variant,x:coordinate(selection.x,50),y:coordinate(selection.y,40)};
}
