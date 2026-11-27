import {loadGameHighlights} from './game-highlights.js';
import {loadCuratedTrending} from './game-curated-trending.js';
import {GAME_HOME_DAY,GAME_HOME_VERSION,nextGameHomeDay,selectDailyGameHome,uniqueHomeGames} from './game-home-selection.js';
import {useIGDBCatalog} from './game-provider.js';
import {publicGameCache} from './game-public-cache.js';
export const GAME_HOME_RETRY_MS=5*60*1000;
const unavailable='Não foi possível atualizar esta seleção. Tente novamente.';
const usable=(section,now)=>section?.games?.length&&Number.isFinite(Date.parse(section.updatedAt))&&+now-Date.parse(section.updatedAt)<7*GAME_HOME_DAY;
const fresh=(section,now)=>section?.expiresAt>+now&&!section.stale&&!section.partial;
function section(result,old,now){
 if(result.status==='fulfilled')return {...result.value,updatedAt:result.value.updatedAt||now.toISOString(),expiresAt:result.value.expiresAt||nextGameHomeDay(now)};
 return usable(old,now)?{...old,stale:true,notice:'Exibindo a última seleção disponível. A atualização será tentada novamente.'}:{games:[],error:unavailable};
}
export async function loadGameHome({now=new Date(),previous,loadRawg=loadGameHighlights,loadTrending=loadCuratedTrending}={}){
 if(previous?.version!==GAME_HOME_VERSION)previous=undefined;
 const pairFresh=previous?.selectionExpiresAt>+now&&previous.games?.length===4&&previous.featured?.games?.length===5&&!previous.selectionStale;
 const [hype,recentResult,upcomingResult]=await Promise.allSettled([
  pairFresh?Promise.resolve(null):loadRawg({now,mode:'hype'}),
  fresh(previous?.recent,now)?Promise.resolve(previous.recent):loadRawg({now,mode:'recent'}),
  fresh(previous?.upcoming,now)?Promise.resolve(previous.upcoming):loadRawg({now,mode:'upcoming'}),
 ]);
 if([hype,recentResult,upcomingResult].every(r=>r.status==='rejected')&&!previous)throw hype.reason;
 const recent=section(recentResult,previous?.recent,now),upcoming=section(upcomingResult,previous?.upcoming,now);
 let pair;
 if(pairFresh)pair={games:previous.games,featured:previous.featured,selectionDay:previous.selectionDay,selectionExpiresAt:previous.selectionExpiresAt};
 else{
  let candidates=uniqueHomeGames([...(hype.status==='fulfilled'?hype.value?.games||[]:[]),...(recentResult.status==='fulfilled'?recent.games:[]),...(upcomingResult.status==='fulfilled'?upcoming.games:[])]);
  // Fetch additional catalogue pages before accepting a sparse selection. Never
  // reuse a banner in highlights to make the section look full.
  let hasNext=hype.status==='fulfilled'&&hype.value?.hasNext;
  for(let page=2;page<=3&&hasNext&&candidates.filter(g=>g.catalogAdded>=100||g.catalogVotes>=20).length<9;page++){
   try{const extra=await loadRawg({now,mode:'hype',page});candidates=uniqueHomeGames([...candidates,...extra.games]);hasNext=extra.hasNext;}catch{break;}
  }
  if(candidates.length)pair={...selectDailyGameHome(candidates,{now,previous}),selectionUpdatedAt:now.toISOString()};
  else if(usable({games:previous?.games,updatedAt:previous?.selectionUpdatedAt},now))pair={games:previous.games,featured:previous.featured,selectionDay:previous.selectionDay,selectionExpiresAt:previous.selectionExpiresAt,selectionUpdatedAt:previous.selectionUpdatedAt,selectionStale:true};
  else pair={games:[],featured:{games:[],error:unavailable},selectionExpiresAt:0,selectionStale:true};
 }
 // Pair freshness must not be extended when retrying a different provider.
 pair.selectionUpdatedAt ||= previous?.selectionUpdatedAt||now.toISOString();
 let trending;
 if(fresh(previous?.trending,now))trending=previous.trending;
 else try{trending={...await loadTrending({now,previous:previous?.trending}),expiresAt:nextGameHomeDay(now)};}
 catch{
  trending=usable(previous?.trending,now)?{...previous.trending,stale:true,notice:'Exibindo a última seleção disponível enquanto o catálogo está indisponível.'}:{games:[],curated:true,error:unavailable};
 }
 const partial=!!(pair.selectionStale||pair.games.length<4||pair.featured.games.length<5||recent.error||recent.stale||upcoming.error||upcoming.stale||trending.error||trending.stale||trending.partial);
 return {...pair,recent,upcoming,trending,version:GAME_HOME_VERSION,generatedAt:now.toISOString(),refreshAt:partial?+now+GAME_HOME_RETRY_MS:nextGameHomeDay(now),partial};
}

// Same public-catalogue caching pattern as the existing providers: one in-flight
// refresh per instance, 24h daily edition, short error backoff, last-good data.
// The API's CDN policy and the client's public snapshot survive cold instances.
export function createGameHomeCache({load=options=>useIGDBCatalog()?publicGameCache('home:'+options.now.toISOString().slice(0,10),()=>loadGameHome(options),{ttl:3600000,stale:6*GAME_HOME_DAY}):loadGameHome(options),clock=Date.now}={}){
 let saved=null,pending=null,retryAt=0,lastError;
 return async()=>{
  const now=clock();if(saved&&saved.refreshAt>now)return saved;
  if(pending)return pending;
  if(retryAt>now){if(saved)return saved;throw lastError;}
  pending=(async()=>{try{const data=await load({now:new Date(now),previous:saved});saved=data;retryAt=0;return data;}
   catch(error){lastError=error;retryAt=now+GAME_HOME_RETRY_MS;if(saved&&now-Date.parse(saved.generatedAt)<7*GAME_HOME_DAY){saved={...saved,partial:true,stale:true,refreshAt:retryAt};return saved;}throw error;}
   finally{pending=null;}})();
  return pending;
 };
}
