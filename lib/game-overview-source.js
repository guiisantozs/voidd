import { fetchJson } from './api.js';
import { normalizeGame } from './game-search.js';
import { gameTrailer } from './game-hero.js';
import { gameOverviewFacts, safeGameStores, OVERVIEW_SCREENSHOTS, OVERVIEW_RELATED } from './game-overview.js';
import {useIGDBCatalog,decodeIGDBGameId} from './game-provider.js';
import {igdbCatalog} from './igdb-catalog.js';

export const OVERVIEW_PARTS=['facts','screenshots','trailer','stores','series','editions','studio'];
export const OVERVIEW_CACHE_MS=300000;
export const OVERVIEW_SERVER_CACHE_LIMIT=200;
export function createGameOverviewSource({fetcher=fetchJson,credentials=()=>process.env.RAWG_API_KEY}={}){
  const cache=new Map();
  async function read(path,params={}){
    const key=credentials();if(!key||key==='cole_sua_chave_aqui')throw Error('CONFIG');
    const query=new URLSearchParams(params),cacheKey=path+'?'+query;
    const prior=cache.get(cacheKey);if(prior&&prior.expires>Date.now())return prior.promise;
    const url=new URL('https://api.rawg.io/api/'+path);url.search=new URLSearchParams({key,...params});
    if(cache.size>=OVERVIEW_SERVER_CACHE_LIMIT)cache.delete(cache.keys().next().value);
    const promise=Promise.resolve().then(()=>fetcher(url)).catch(error=>{cache.delete(cacheKey);throw error;});cache.set(cacheKey,{promise,expires:Date.now()+OVERVIEW_CACHE_MS});return promise;
  }
  return async function load(id,part){
    if((useIGDBCatalog()&&fetcher===fetchJson)||decodeIGDBGameId(id)){
      const game=await igdbCatalog.detail(id);
      if(part==='facts')return {platformCount:game.plataformas.length,tags:[],developers:[],publishers:[],requirements:null,esrb:'',playtime:null};
      if(part==='screenshots')return game.screenshots;
      if(part==='stores')return safeGameStores(game.stores);
      if(part==='trailer')return null;
      if(['series','editions','studio'].includes(part))return [];
      throw Error('INVALID');
    }
    if(part==='facts')return gameOverviewFacts(await read(`games/${id}`));
    if(part==='screenshots'){const data=await read(`games/${id}/screenshots`,{page_size:String(OVERVIEW_SCREENSHOTS)});return(data.results||[]).map(row=>row.image).filter(Boolean).slice(0,OVERVIEW_SCREENSHOTS);}
    if(part==='trailer'){const data=await read(`games/${id}/movies`);return gameTrailer(data.results||[]);}
    if(part==='stores'){const data=await read(`games/${id}/stores`);return safeGameStores(data.results||[]);}
    let data;
    if(part==='series')data=await read(`games/${id}/game-series`,{page_size:String(OVERVIEW_RELATED+1)});
    else if(part==='editions')data=await read(`games/${id}/additions`,{page_size:String(OVERVIEW_RELATED)});
    else if(part==='studio'){
      const seed=await read(`games/${id}`),developer=(seed.developers||[]).find(row=>Number.isInteger(row.id)&&row.id>0);
      if(!developer)return[];
      data=await read('games',{developers:String(developer.id),exclude_additions:'true',ordering:'-added',page_size:String(OVERVIEW_RELATED+1)});
    }else throw Error('INVALID');
    return [...new Map((data.results||[]).filter(row=>Number.isInteger(row.id)&&String(row.id)!==id&&row.name&&row.background_image).map(row=>[row.id,normalizeGame(row)])).values()].slice(0,OVERVIEW_RELATED);
  };
}
export const loadGameOverviewPart=createGameOverviewSource();
