import { fetchJson } from './api.js';
import { findIGDBCover } from './igdb-covers.js';
import { createGameCoverResolver } from './game-covers.js';
import {useIGDBCatalog,decodeIGDBGameId} from './game-provider.js';
import {igdbCatalog} from './igdb-catalog.js';
const stores=new Map(),pendingStores=new Map();
export async function loadGameStoreLinks(id){
  if(!/^[1-9]\d{0,9}$/.test(String(id)))throw Error('INVALID_GAME');
  if(useIGDBCatalog()||decodeIGDBGameId(id))return (await igdbCatalog.detail(id)).stores;
  if(stores.get(id)?.expires>Date.now())return stores.get(id).rows;
  if(pendingStores.has(id))return pendingStores.get(id);
  const task=(async()=>{const key=process.env.RAWG_API_KEY;if(!key)throw Error('CONFIG');const data=await fetchJson(`https://api.rawg.io/api/games/${id}/stores?key=${encodeURIComponent(key)}`);if(!Array.isArray(data.results))throw Error('STORES_UNAVAILABLE');if(stores.size>=500)stores.delete(stores.keys().next().value);stores.set(id,{rows:data.results,expires:Date.now()+86400000});return data.results;})().finally(()=>pendingStores.delete(id));
  pendingStores.set(id,task);return task;
}

// One public catalogue resolver for cover UI and authorized review images.
const resolveRawgCover = createGameCoverResolver({ findCover: findIGDBCover, loadStores:loadGameStoreLinks, loadGame: async id => {
  const key=process.env.RAWG_API_KEY;
  if(!key)throw new Error('CONFIG');
  return fetchJson(`https://api.rawg.io/api/games/${id}?key=${encodeURIComponent(key)}`);
} });
export async function resolveGameCover(id){
 if(useIGDBCatalog()||decodeIGDBGameId(id)){
  const game=await igdbCatalog.detail(id);
  return {status:200,body:{cover:game.officialCover,fallback:null,...(game.steamAppId?{steamAppId:game.steamAppId}:{})}};
 }
 return resolveRawgCover(id);
}
