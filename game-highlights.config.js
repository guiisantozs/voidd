import { editorialGames } from './lib/games.js';
import { workHref } from './lib/work-client.js';

// Presentation only: add artwork/logos under public/images/games, then edit here.
export default [
  {
    id: 'gta-vi', title: 'Grand Theft Auto VI', gallery: false,
    background: '/images/games/vice-city-artwork.jpg',
    logo: '/images/games/gta-vi-logo-white-transparent.png',
    // The supplied PNG includes transparent margins; frame only the visible mark.
    logoCrop: { aspectRatio: '1249 / 891', width: '122.97838%', left: '-9.60769%', top: '-12.34568%', sourceWidth: 1536, sourceHeight: 1024 },
    position: '50% 38%', mobilePosition: '50% top',
    description: 'Explore jogos, registre suas avaliações e encontre seu próximo favorito.',
    primary: { label: 'Explorar jogos', href: '#game-search-title' },
    secondary: { label: 'Minha biblioteca', href: '/jogos?view=library#biblioteca' },
    trailerUrl: null, credit: 'Arte: GTA VI · Rockstar Games',
    creditUrl: 'https://www.rockstargames.com/VI/media/artwork-wallpapers',
  },
  ...[58175, 326243, 3498, 3328].map(id => editorialGames.find(game => game.id === id)).filter(Boolean).map(item => ({
    id: String(item.id), title: item.titulo, background: item.backdrop || item.poster,
    logo: null, position: '65% center', mobilePosition: '55% top',
    description: item.sinopse, item,
    primary: { label: 'Ver jogo', href: workHref(item) },
    secondary: { label: 'Avaliar jogo', href: `/avaliar?categoria=jogos&id=${item.id}` },
    trailerUrl: null, credit: `Curadoria VOID · Arte ${item.fonte}`,
  })),
];
