export const gameGenres = [
  { key: 'action', label: 'Ação', names: ['Action', 'Ação'] },
  { key: 'adventure', label: 'Aventura', names: ['Adventure', 'Aventura'] },
  { key: 'role-playing-games-rpg', label: 'RPG', names: ['RPG'] },
  { key: 'strategy', label: 'Estratégia', names: ['Strategy', 'Estratégia'] },
  { key: 'shooter', label: 'Tiro', names: ['Shooter'] },
  { key: 'puzzle', label: 'Puzzle', names: ['Puzzle'] },
  { key: 'racing', label: 'Corrida', names: ['Racing'] },
  { key: 'sports', label: 'Esportes', names: ['Sports'] },
  { key: 'indie', label: 'Indie', names: ['Indie'] },
];
export const parentPlatforms = { PC: '1', PlayStation: '2', Xbox: '3', Nintendo: '7' };
export function hasGenre(item, key) {
  if (key === 'all') return true;
  const genre = gameGenres.find(option => option.key === key);
  return !!genre && item.generos?.some(name => genre.names.includes(name));
}
