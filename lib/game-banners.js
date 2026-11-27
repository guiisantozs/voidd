import { workHref } from './work-client.js';
import {isGtaVI} from './game-home-selection.js';

export function gameBanners(config, games) {
  const first = config.find(item => item.id === 'gta-vi');
  const seen=new Set();
  const rest = games.filter(item => item?.id&&!isGtaVI(item)&&!seen.has(String(item.id))&&seen.add(String(item.id))).slice(0, 4).map(item => {
    const custom = config.find(entry => String(entry.item?.id ?? entry.gameId) === String(item.id));
    return {
      background: item.backdrop || item.poster,
      logo: null, description: item.sinopse,
      primary: { label: 'Ver jogo', href: workHref(item) },
      secondary: { label: 'Avaliar jogo', href: `/avaliar?categoria=jogos&id=${item.id}` },
      credit: `Seleção diária · ${item.fonte || 'RAWG'}`, ...custom, id:String(item.id),title:item.titulo,item,
    };
  });
  return first ? [first, ...rest] : rest;
}
