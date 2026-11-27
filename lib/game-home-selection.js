import {validReleaseDate} from './movie-release.js';
export const GAME_HOME_VERSION=6;
export const GAME_HOME_DAY=86400000;
export const GTA_VI_ID='972995';
export const isGtaVI=game=>String(game?.id)===GTA_VI_ID||/^(?:grand theft auto (?:vi|6)|gta\s*(?:vi|6))$/i.test(String(game?.titulo||game?.name||'').trim());
export const nextGameHomeDay=now=>Date.parse(new Date(now).toISOString().slice(0,10))+GAME_HOME_DAY;
export function homeGameValid(game){return /^[1-9]\d*$/.test(String(game?.id))&&game.categoria==='jogos'&&typeof game.titulo==='string'&&game.titulo.trim()&&/^https:\/\//.test(game.backdrop||game.poster||'')&&validReleaseDate(game.estreia)&&!isGtaVI(game);}
export function uniqueHomeGames(games){const seen=new Set();return games.filter(g=>{const id=String(g?.id);if(!homeGameValid(g)||seen.has(id))return false;seen.add(id);return true;});}
function relevance(game,now){const age=(now-Date.parse(game.estreia))/GAME_HOME_DAY;return Math.log2(1+Math.max(0,Number(game.catalogAdded)||0))*3+(game.catalogVotes>=20?(game.nota||0)*2:0)+(age>=0&&age<=30?12:age>=0&&age<=180?6:age<0?3:0);}
// Rotate a quality-qualified catalogue pool, not a random list or carousel index.
// With an unchanged pool of at least 18 games, adjacent days have no repeated
// banners OR highlights. Stored history also covers changes to provider order.
export function selectDailyGameHome(candidates,{now=new Date(),previous}={}){
 const day=Math.floor(+now/GAME_HOME_DAY),today=now.toISOString().slice(0,10);
 const ranked=uniqueHomeGames(candidates).filter(g=>g.estreia<=new Date(+now+180*GAME_HOME_DAY).toISOString().slice(0,10)).sort((a,b)=>relevance(b,+now)-relevance(a,+now)||Number(a.id)-Number(b.id));
 const qualified=ranked.filter(g=>g.catalogAdded>=100||g.catalogVotes>=20);
 const pool=(qualified.length>=9?qualified:ranked).slice(0,45).sort((a,b)=>Number(a.id)-Number(b.id));
 const stride=pool.length>=18?9:4;
 const rotated=pool.map((_,i)=>pool[(day*stride+i)%pool.length]);
 const previousDay=previous?.selectionDay!==today;
 const oldBanners=previousDay?new Set((previous?.games||[]).map(g=>String(g.id))):new Set();
 const old=previousDay?new Set([...(previous?.games||[]),...(previous?.featured?.games||[])].map(g=>String(g.id))):new Set();
 const ordered=[...rotated.filter(g=>!old.has(String(g.id))),...rotated.filter(g=>old.has(String(g.id))&&!oldBanners.has(String(g.id))),...rotated.filter(g=>oldBanners.has(String(g.id)))];
 const games=ordered.slice(0,4),excluded=new Set(games.map(g=>String(g.id)));
 return {games,featured:{games:ordered.filter(g=>!excluded.has(String(g.id))).slice(0,5)},selectionDay:today,selectionExpiresAt:nextGameHomeDay(now)};
}
