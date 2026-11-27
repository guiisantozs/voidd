import { collectionGameHref } from './game-collection.js';

export function safeGamerArtwork(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    if(url.hostname==='images.igdb.com'&&/^\/igdb\/image\/upload\/t_(?:1080p|cover_big|screenshot_big)(?:_2x)?\/[-a-zA-Z0-9_]+\.jpg$/.test(url.pathname))return url.href;
    if (url.hostname === 'media.rawg.io' && /^\/media\/(?:games|screenshots)\//.test(url.pathname)) return url.href;
    if (/(?:^|\.)(?:steamstatic\.com|steamcdn-a\.akamaihd\.net)$/.test(url.hostname) && /\/(?:steam\/apps|store_item_assets\/steam\/apps)\/[1-9][0-9]*\//.test(url.pathname)) return url.href;
  } catch { /* Only trusted public game artwork can become a banner. */ }
  return null;
}
export function steamGameArt(appid) {
  if (!/^[1-9][0-9]*$/.test(String(appid || ''))) return [];
  const base = `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/`;
  return [{ variant:'hero',label:'Steam · arte panorâmica',url:base+'library_hero.jpg' },{ variant:'header',label:'Steam · capa horizontal',url:base+'header.jpg' },{ variant:'capsule',label:'Steam · capsule',url:base+'capsule_616x353.jpg' }];
}
export function gamerArtOptions(game) {
  const images = [];
  if (safeGamerArtwork(game.rawg_background)) images.push({variant:'rawg',label:'RAWG · imagem de fundo',url:game.rawg_background});
  if (safeGamerArtwork(game.rawg_additional) && game.rawg_additional !== game.rawg_background) images.push({variant:'additional',label:'RAWG · arte adicional',url:game.rawg_additional});
  images.push(...steamGameArt(game.steam_appid));
  if (!images.length && safeGamerArtwork(game.cover_url)) images.push({variant:'cover',label:'Imagem disponível',url:game.cover_url});
  return images;
}
export function collectionAppearanceChoice(game) {
  const steam = game.platforms?.find(row=>row.provider==='steam');
  return {source:'collection',id:game.id,collection_id:game.id,rawg_id:game.rawg_id||null,title:game.title,cover_url:safeGamerArtwork(game.cover_url),steam_appid:steam?.external_id||null,genres:game.genres||[],rawg_background:game.cover_url?.includes('media.rawg.io/')?safeGamerArtwork(game.cover_url):null};
}
export function favoriteAsGame(favorite) {
  if (!favorite) return null;
  return {id:favorite.collection_id||`rawg-${favorite.rawg_id}`,...(favorite.catalog_id?{catalog_id:favorite.catalog_id}:{}),...(favorite.officialCover?{officialCover:favorite.officialCover}:{}),title:favorite.title,cover_url:favorite.cover_url,rawg_background:favorite.rawg_background,rawg_additional:favorite.rawg_additional,rawg_id:favorite.rawg_id,platforms:favorite.steam_appid?[{provider:'steam',external_id:favorite.steam_appid}]:[]};
}
export function favoriteGameHref(favorite, target = null) {
  if (favorite?.collection_id && target) return `/jogos/colecao/${favorite.collection_id}?target=${target}`;
  if (favorite?.catalog_id) return `/obra/jogos/${favorite.catalog_id}`;
  if (favorite?.rawg_id) return `/obra/jogos/${favorite.rawg_id}`;
  return favorite?.collection_id?`/jogos/colecao/${favorite.collection_id}`:'/jogos';
}
export function gamerGameHref(game, target = null) { return target?`/jogos/colecao/${game.id}?target=${target}`:collectionGameHref(game); }
export function landscapeSources(game, metadata) {
  const steam = game.platforms?.find(row=>row.provider==='steam');
  return [...new Set([...steamGameArt(steam?.external_id).map(art=>art.url),metadata?.rawg_background,metadata?.rawg_additional,game.cover_url].map(safeGamerArtwork).filter(Boolean))];
}
export function bannerSources(banner, fallbackGame) {
  if (banner) return [...new Set([banner.url,...gamerArtOptions(banner).map(art=>art.url)].map(safeGamerArtwork).filter(Boolean))];
  return fallbackGame?.cover_url?[fallbackGame.cover_url]:[];
}
export function playedGenrePills(games, metadata = {}) {
  const translations = {Action:'Ação',Adventure:'Aventura',Sports:'Esportes',Shooter:'Tiro',Strategy:'Estratégia',Racing:'Corrida',Simulation:'Simulação',Platformer:'Plataforma',Puzzle:'Quebra-cabeça','Open World':'Mundo aberto','Co-op':'Cooperativo'};
  const genres = new Map();
  for (const game of games) {
    const info = metadata[game.rawg_id] || {};
    const labels = [...new Set([...(info.genres||[]),...(info.tags||[]).filter(tag=>['FPS','Open World','Co-op'].includes(tag))])];
    for (const original of labels) {
      const name = translations[original]||original;
      if (!genres.has(name)) genres.set(name,{name,minutes:0,games:0});
      const row = genres.get(name);row.games++;row.minutes+=Number.isFinite(game.minutes)?Math.max(0,game.minutes):0;
    }
  }
  return [...genres.values()].sort((a,b)=>b.minutes-a.minutes||b.games-a.games||a.name.localeCompare(b.name)).slice(0,5);
}
