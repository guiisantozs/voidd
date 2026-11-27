import { franchises } from '../franchises.config.js';
import { movieUniverseLandings } from './movie-universe-landings.js';
import { marvelUniverse } from './marvel-universe.js';

// Colors and original logos have one source of truth: franchises.config.js.
// Enable additional media only when the corresponding catalogue exists.
const invitations = {
  'marvel-mcu': 'Grandes encontros. Histórias que se conectam.',
  'star-wars': 'Encontre seu lugar em uma galáxia muito, muito distante.',
  'harry-potter': 'Há sempre um caminho de volta a Hogwarts.',
  dc: 'Da esperança de Metrópolis às sombras de Gotham.',
  jurassic: 'A aventura está longe de ser extinta.',
  'terra-media': 'Uma jornada extraordinária começa com um primeiro passo.',
  'velozes-e-furiosos': 'A próxima missão começa em família.',
  matrix: 'Existe um mundo além do que você vê.',
  'piratas-do-caribe': 'Novos horizontes. Lendas que atravessam os mares.',
  'toy-story': 'Ao infinito e a cada nova aventura.',
};
export const movieUniversePortal = Object.fromEntries(franchises.map(franchise => [franchise.slug, {
  accent: franchise.cor, logo: franchise.logo,
  chronology: franchise.ordem_cronologica || [],
  artwork: movieUniverseLandings[franchise.slug]?.hero || (franchise.slug === 'marvel-mcu' ? marvelUniverse.hero : null),
  position: movieUniverseLandings[franchise.slug]?.heroStyle?.objectPosition || 'center 35%',
  invitation: invitations[franchise.slug], media: ['filmes'],
}]));
