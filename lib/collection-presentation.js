import { gameCoverCandidates,gameCoverId,gameSteamAppId,officialGameCover } from './game-cover-client.js';
// Presentation only: no platform writes, persisted ranks or changes to imported progress.
export function collectionLevel(stats) {
  if (!stats) return null;
  const positive = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const hours = positive(stats.minutes) / 60;
  const xp = Math.floor(hours * 10 + positive(stats.unlocked) * 25 + positive(stats.completed) * 250);
  const level = Math.floor(xp / 1000) + 1;
  return { xp, level, current: xp % 1000, next: 1000, rank: level >= 30 ? 'Lenda' : level >= 15 ? 'Veterano' : level >= 5 ? 'Jogador' : 'Iniciante' };
}
export function gameAchievementSummary(game) {
  const rows = (game.platforms || []).filter(row => Number.isInteger(row.achievement_total) && row.achievement_total > 0 && Number.isInteger(row.achievement_unlocked));
  const best = [...rows].sort((a, b) => b.achievement_unlocked / b.achievement_total - a.achievement_unlocked / a.achievement_total)[0];
  if (!best) return { percent: null, unlocked: null, total: null, completed: false, stale: false, none: game.platforms?.some(row => row.achievement_status === 'none') || false };
  const completed = best.achievement_unlocked === best.achievement_total;
  return { percent: completed ? 100 : Math.min(99, Math.round(best.achievement_unlocked / best.achievement_total * 100)), unlocked: best.achievement_unlocked, total: best.achievement_total, completed, stale: best.achievement_status === 'unavailable', none: false };
}
export function collectionBadges(games, stats) {
  return [
    { key: 'first', title: 'Primeira platina', description: 'Um jogo com 100% das conquistas.', unlocked: Number(stats?.completed) >= 1, icon: 'trophy' },
    { key: 'hours', title: '100 h em um jogo', description: 'Cem horas registradas no mesmo jogo.', unlocked: games.some(game => game.minutes >= 6000), icon: 'clock' },
    { key: 'games', title: '10 jogos jogados', description: 'Dez universos com atividade confirmada.', unlocked: Number(stats?.games) >= 10, icon: 'gamepad' },
  ];
}
export function collectionPortraitSources(game) {
  return gameCoverCandidates(collectionCoverItem(game),{loading:false}).map(image=>image.url);
}
export function collectionCoverItem(game={}) {
  return {id:gameCoverId(game.catalog_id)||gameCoverId(game.rawg_id)||(game.categoria==='jogos'?gameCoverId(game.id):null),categoria:'jogos',
    titulo:game.title||game.titulo||'Jogo',steamAppId:gameSteamAppId(game),
    officialCover:officialGameCover(game.officialCover)||officialGameCover({url:game.cover_url}),
    poster:game.cover_url||game.poster||game.rawg_background||null,backdrop:game.rawg_additional||game.backdrop||game.rawg_background||null,
    rawg_background:game.rawg_background,rawg_additional:game.rawg_additional};
}
