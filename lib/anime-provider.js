// Persisted TMDB anime IDs remain untouched. New MAL works use a reserved
// numeric range, scoped to animes (IGDB uses its own jogos namespace).
export const MAL_ID_BASE=9000000000;
export const animeId=id=>Number.isSafeInteger(Number(id))&&Number(id)>0&&Number(id)<1000000000?MAL_ID_BASE+Number(id):null;
export const decodeAnimeId=id=>/^[1-9]\d{0,9}$/.test(String(id))&&Number(id)>MAL_ID_BASE?Number(id)-MAL_ID_BASE:null;
export const isJikanAnime=item=>item?.categoria==='animes'&&!!decodeAnimeId(item.id);
export function adjacentAnime(items=[],previous=[]){const seen=new Set(previous.map(item=>String(item.id)));return items.filter(item=>{if(item?.categoria!=='animes'||!item.poster||seen.has(String(item.id)))return false;seen.add(String(item.id));return true;}).slice(0,18);}
