import { gameStatusKey } from './library.js';
import { libraryMatchesPlatform, libraryPlatforms, normalizeLibraryText } from './game-library-filters.js';
import { workHref } from './work-client.js';
export const universeGameHref = (universe, game) => game.id ? workHref(game) : `/jogos/universos/${encodeURIComponent(universe.slug)}/${game.igdbId}`;
export const universeGroups=[{key:'main',label:'Jogos principais'},{key:'remasters',label:'Remasters e remakes'},{key:'spinoffs',label:'Expansões e spin-offs'}];
export const releaseOrder=(a,b)=>(a.estreia||'9999').localeCompare(b.estreia||'9999')||(a.igdbId||a.id)-(b.igdbId||b.id);
export function gameUniverseView(data,entries={}, {query='',order='popular',platform=''}={}){
  const all=data?.games||[];
  const matches=game=>normalizeLibraryText(game.titulo).includes(normalizeLibraryText(query.trim()))&&libraryMatchesPlatform(game,platform);
  const compare=order==='year'?(a,b)=>releaseOrder(b,a):order==='rating'?(a,b)=>(b.nota??-1)-(a.nota??-1)||releaseOrder(a,b):releaseOrder;
  const games=all.filter(matches).sort(compare),start=games.find(game=>game.igdbId===all[0]?.igdbId);
  const linked=all.filter(game=>game.id&&entries[String(game.id)]);
  return {games,start,groups:universeGroups.map(group=>({...group,games:games.filter(game=>game.group===group.key&&game!==start)})).filter(group=>group.games.length),
    extras:(data?.extras||[]).filter(matches).sort(compare),
    platforms:libraryPlatforms.filter(option=>all.some(game=>libraryMatchesPlatform(game,option.key))),
    years:[...new Set(games.map(game=>game.ano).filter(Boolean))].sort(),
    hasLibraryGames:linked.length>0,finished:linked.filter(game=>['finished','platinum'].includes(gameStatusKey(entries[String(game.id)]))).length};
}
