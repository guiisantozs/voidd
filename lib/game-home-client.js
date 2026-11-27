import {GAME_HOME_DAY,GAME_HOME_VERSION,isGtaVI} from './game-home-selection.js';
import {GAME_CATALOG_CONFIGURATION_MESSAGE} from './game-catalog-error.js';
export const GAME_HOME_STORAGE=`void:public-game-home:v${GAME_HOME_VERSION}`;
export function gameHomeNextRefresh(data,now=Date.now()){return data.refreshAt>now?data.refreshAt:now+300000;}
export function validGameHomeSnapshot(data,now=Date.now()){
 if(data?.version!==GAME_HOME_VERSION||!Number.isFinite(Date.parse(data.generatedAt))||Date.parse(data.generatedAt)>now+300000||now-Date.parse(data.generatedAt)>7*GAME_HOME_DAY||!Number.isFinite(data.refreshAt))return false;
 const groups=[data.games,data.featured?.games,data.recent?.games,data.upcoming?.games,data.trending?.games];
 if(groups.some(rows=>!Array.isArray(rows)||rows.length>120||rows.some(g=>!g||g.categoria!=='jogos'||!/^[1-9]\d*$/.test(String(g.id))||typeof g.titulo!=='string')))return false;
 const ids=new Set();for(const g of [...data.games,...data.featured.games]){if(isGtaVI(g)||ids.has(String(g.id)))return false;ids.add(String(g.id));}
 return true;
}
export function readGameHomeSnapshot(storage,now=Date.now()){try{const data=JSON.parse(storage?.getItem(GAME_HOME_STORAGE)||'null');return validGameHomeSnapshot(data,now)?data:null;}catch{return null;}}
export function storeGameHomeSnapshot(storage,data){try{storage?.setItem(GAME_HOME_STORAGE,JSON.stringify(data));}catch{/* Public fallback is optional when storage is unavailable. */}}
export async function fetchGameHome({fetcher=fetch,signal,now=Date.now()}={}){
 const response=await fetcher(`/api/game-highlights?v=${GAME_HOME_VERSION}`,{signal});const data=await response.json();
 if(!response.ok&&data?.code==='GAME_CATALOG_CONFIGURATION')throw Error(GAME_CATALOG_CONFIGURATION_MESSAGE);
 if(!response.ok||!validGameHomeSnapshot(data,now))throw Error('Não foi possível atualizar as seleções de jogos.');
 return data;
}
