import { createIGDBClient, requestIGDB } from './igdb-client.js';
import curatedGames from '../game-trending.config.js';
// The production instance shares its token and rate limit with universe queries.
export function createIGDBCoverClient(options = {}) {
  const request = options.request || createIGDBClient(options);
  return async function findCover(game){
    if(!game?.name)return null;
    // RAWG appends a release year to some titles, e.g. Ocarina of Time (1998).
    // Remove only that suffix; edition/remaster subtitles still distinguish games.
    const alias=curatedGames.find(entry=>String(entry.id)===String(game.id)&&entry.igdbName);
    const name=alias?.igdbName||game.name.replace(/\s*\((?:19|20)\d{2}\)\s*$/,'').trim();
    const body=`search ${JSON.stringify(name.slice(0,200))}; fields name,slug,first_release_date,cover.image_id,cover.width,cover.height,artworks.image_id,artworks.width,artworks.height${alias?',involved_companies.company.name':''}; limit 30;`;
    const rows=await request('games',body);
    const normalize=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const suffixYear=game.name.match(/\(((?:19|20)\d{2})\)\s*$/)?.[1];
    const year=/^\d{4}-\d{2}-\d{2}$/.test(game.released||'')?Number(game.released.slice(0,4)):suffixYear?Number(suffixYear):null;
    const matches=(Array.isArray(rows)?rows:[]).filter(row=>normalize(row.name)===normalize(name)&&(!alias||row.involved_companies?.some(company=>normalize(company.company?.name).startsWith(normalize(alias.igdbCompany))))&&(!year||!row.first_release_date||Math.abs(new Date(row.first_release_date*1000).getUTCFullYear()-year)<=1));
    if(matches.length!==1||!/^[-a-zA-Z0-9_]+$/.test(matches[0].cover?.image_id||'')||!/^[-a-z0-9]+$/.test(matches[0].slug||''))return null;
    const match=matches[0];
    const artwork=(match.artworks||[]).filter(image=>/^[-a-zA-Z0-9_]+$/.test(image.image_id||'')&&image.width>=1600&&image.height>=900).sort((a,b)=>b.width*b.height-a.width*a.height)[0];
    const poster=match.cover.width>=900&&match.cover.height>=1200?match.cover:null;
    const asset=artwork||poster;
    return {url:`https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${match.cover.image_id}.jpg`,source:'IGDB',sourceUrl:`https://www.igdb.com/games/${match.slug}`,
      ...(match.cover.width>0&&match.cover.height>0?{width:match.cover.width,height:match.cover.height}:{}),
      ...(asset?{heroArtwork:{url:`https://images.igdb.com/igdb/image/upload/t_1080p${artwork?'_2x':''}/${asset.image_id}.jpg`,width:asset.width,height:asset.height,portrait:!artwork,source:'IGDB'}}:{})};
  };
}
export const findIGDBCover=createIGDBCoverClient({request:requestIGDB});
