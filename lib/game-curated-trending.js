import selection from '../game-trending.config.js';
import {getWork} from './details.js';
import {findIGDBCover} from './igdb-covers.js';
import {nextGameHomeDay,GAME_HOME_DAY} from './game-home-selection.js';
import {loadGameStoreLinks} from './game-cover-server.js';
import {steamAppId} from './game-collection.js';

export async function loadCuratedTrending({now=new Date(),previous,loadWork=getWork,findCover=findIGDBCover,loadStores=loadGameStoreLinks,entries=selection,interval=650}={}){
 const old=new Map((previous?.games||[]).map(game=>[String(game.id),game])),games=new Array(entries.length),unavailable=[];let partial=false;
 for(let index=0;index<entries.length;index++){
   const started=Date.now(),entry=entries[index],prior=old.get(String(entry.id));
   try{
    const reused=prior?.metadataExpiresAt>+now;
    let game,metadataError=false;
    try{game=reused?prior:await loadWork('jogos',String(entry.id));if(String(game?.id)!==String(entry.id)||game.categoria!=='jogos'||typeof game.titulo!=='string')throw Error('CURATION_ID_MISMATCH');}
    catch{metadataError=true;partial=true;unavailable.push(entry.title);game=prior&&+now-Date.parse(prior.catalogUpdatedAt)<7*GAME_HOME_DAY?prior:{id:entry.id,categoria:'jogos',titulo:entry.title,poster:null,backdrop:null,estreia:null,ano:'',nota:null,generos:[],plataformas:[],fonte:'RAWG'};}
    let officialCover=reused?prior.officialCover:game.officialCover||null,coverPending=false,steam=game.steamAppId||prior?.steamAppId;
    if(!reused||prior.coverPending){
     try{const [cover,links]=await Promise.all([officialCover?Promise.resolve(officialCover):findCover({id:entry.id,name:game.catalogTitle||game.titulo,released:game.estreia}),loadStores(String(entry.id)).catch(()=>[])]);officialCover=cover;steam=links.map(link=>steamAppId(link.url)).find(Boolean)||steam;}
     catch{officialCover=prior?.officialCover||null;coverPending=true;partial=true;}
    }
    games[index]={...game,catalogTitle:game.catalogTitle||game.titulo,titulo:entry.title,trendReason:'curated',officialCover,coverPending,...(steam?{steamAppId:steam}:{}),metadataExpiresAt:metadataError?+now:nextGameHomeDay(now),catalogUpdatedAt:metadataError?(prior?.catalogUpdatedAt||now.toISOString()):reused?prior.catalogUpdatedAt:now.toISOString(),...(metadataError?{stale:true}:{})};
   }catch{
    partial=true;
    if(prior&&+now-Date.parse(prior.catalogUpdatedAt)<7*GAME_HOME_DAY)games[index]={...prior,titulo:entry.title,stale:true};
    else unavailable.push(entry.title);
   }finally{if(interval&&index<entries.length-1){const wait=interval-(Date.now()-started);if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));}}
 }
 const rows=games.filter(Boolean);
 if(!rows.length)throw Error('CURATED_GAMES_UNAVAILABLE');
 return {games:rows,curated:true,partial,source:'Curadoria VOID',updatedAt:now.toISOString(),basis:{source:rows.some(g=>g.fonte==='IGDB')?'IGDB':'RAWG',criterion:'Seleção especial do VOID. Jogos escolhidos para você explorar.',window:'curated',monthlyPlayers:false},...(partial?{notice:'Parte da seleção está aguardando atualização do catálogo.'}:{}),...(unavailable.length?{unavailable}:{})};
}
