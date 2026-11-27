// Seleção editorial para explorar o layout mesmo sem uma chave RAWG.
// IDs do catálogo RAWG; imagens distribuídas pelo Steam.
export const editorialGames = [
  { id: 326243, titulo: 'Elden Ring', steam: 1245620, ano: '2022', generos: ['RPG', 'Ação'], plataformas: ['PC', 'PlayStation', 'Xbox'], sinopse: 'Um mundo imenso, caminhos inesperados e desafios que transformam cada conquista em uma história sua.' },
  { id: 3328, titulo: 'The Witcher 3: Wild Hunt', steam: 292030, ano: '2015', generos: ['RPG', 'Aventura'], plataformas: ['PC', 'PlayStation', 'Xbox', 'Nintendo'], sinopse: 'Monstros, escolhas difíceis e histórias que continuam com você muito depois da última missão.' },
  { id: 4200, titulo: 'Portal 2', steam: 620, ano: '2011', generos: ['Puzzle', 'Aventura'], plataformas: ['PC', 'PlayStation', 'Xbox'], sinopse: 'Repense o espaço, desconfie das instruções e descubra uma nova solução do outro lado de cada portal.' },
  { id: 3498, titulo: 'Grand Theft Auto V', steam: 271590, ano: '2013', generos: ['Ação', 'Aventura'], plataformas: ['PC', 'PlayStation', 'Xbox'], sinopse: 'Três perspectivas e uma cidade cheia de possibilidades. Qual história você vai levar de Los Santos?' },
  { id: 5679, titulo: 'The Elder Scrolls V: Skyrim', steam: 489830, ano: '2011', generos: ['RPG', 'Aventura'], plataformas: ['PC', 'PlayStation', 'Xbox', 'Nintendo'], sinopse: 'Uma estrada, uma montanha no horizonte e a liberdade de esquecer a missão principal por mais uma aventura.' },
  { id: 58175, titulo: 'God of War', steam: 1593500, ano: '2018', generos: ['Ação', 'Aventura'], plataformas: ['PC', 'PlayStation'], sinopse: 'Uma jornada entre deuses, criaturas e os laços que fazem uma história ter peso.' },
].map(game => ({ ...game, categoria: 'jogos', nota: null, editorial: true,
  poster: `https://cdn.akamai.steamstatic.com/steam/apps/${game.steam}/header.jpg`,
  backdrop: `https://cdn.akamai.steamstatic.com/steam/apps/${game.steam}/library_hero.jpg`,
  screenshots: [], informacoes: [{ label: 'Plataformas', valor: game.plataformas.join(', ') }],
  fonte: 'Steam', fonteUrl: `https://store.steampowered.com/app/${game.steam}/`,
}));

export const platforms = [
  { key: 'all', label: 'Todos', mark: 'sparkle', sub: 'Seu próximo universo' },
  { key: 'PC', label: 'PC', logo: '/images/platforms/steam.png', sub: 'Mais um capítulo' },
  { key: 'PlayStation', label: 'PlayStation', logo: '/images/platforms/playstation.png', sub: 'Grandes jornadas' },
  { key: 'Xbox', label: 'Xbox', logo: '/images/platforms/xbox.png', sub: 'Novas possibilidades' },
  { key: 'Nintendo', label: 'Nintendo', logo: '/images/platforms/nintendo.png', sub: 'Pura descoberta' },
];

export function filterGames(items, { query = '', platform = 'all', genre = 'all', order = 'popular' } = {}) {
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtered = items.filter(item => normalize(item.titulo).includes(normalize(query.trim()))
    && (platform === 'all' || item.plataformas?.some(name => name.toLowerCase().includes(platform.toLowerCase())))
    && (genre === 'all' || item.generos?.includes(genre)));
  return order === 'rating' ? [...filtered].sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1))
    : order === 'year' ? [...filtered].sort((a, b) => Number(b.ano || 0) - Number(a.ano || 0)) : filtered;
}
