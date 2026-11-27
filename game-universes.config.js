import godOfWar from './config/game-universes/god-of-war.js';
import gta from './config/game-universes/grand-theft-auto.js';
import lastOfUs from './config/game-universes/the-last-of-us.js';
import zelda from './config/game-universes/the-legend-of-zelda.js';
const rules = { 'god-of-war': godOfWar, 'grand-theft-auto': gta, 'the-last-of-us': lastOfUs, 'the-legend-of-zelda': zelda };
// Presentation lives here; all provider-specific curation lives in config/game-universes/.
export const gameUniverses = [
  { slug: 'god-of-war', nome: 'God of War', cor: '#d56873', query: 'God of War', family: 'god of war', descricao: 'Deuses, monstros e os caminhos de Kratos. Explore as jornadas das mitologias grega e nórdica.' },
  { slug: 'grand-theft-auto', nome: 'Grand Theft Auto', cor: '#b99cde', query: 'Grand Theft Auto', family: 'grand theft auto', descricao: 'Cidades que nunca param e histórias que se cruzam. Encontre seu próximo destino no universo de GTA.' },
  { slug: 'the-last-of-us', nome: 'The Last of Us', cor: '#9ab398', query: 'The Last of Us', family: 'the last of us', descricao: 'Sobreviver é só o começo. Reencontre as histórias e os laços que marcam o mundo de The Last of Us.' },
  { slug: 'the-legend-of-zelda', nome: 'The Legend of Zelda', cor: '#d8bd78', query: 'The Legend of Zelda', family: 'the legend of zelda', descricao: 'Uma nova aventura espera em Hyrule. Descubra os jogos que fazem parte da lenda de Link e Zelda.' },
].map(universe => ({ ...universe, ...rules[universe.slug], cor: rules[universe.slug].accent, logo: universe.slug === 'grand-theft-auto'
  ? { src: '/universos/jogos/grand-theft-auto.svg', width: 431.5, height: 347.45, crop: '0 0 431.5 347.45' }
  : { src: `/universos/jogos/${universe.slug}.png`, transparent: true, ...(universe.slug === 'the-legend-of-zelda' ? { width: 1536, height: 1024, alphaCutoff: .82 } : {}) } }));

export const gameUniverseBySlug = slug => typeof slug === 'string' ? gameUniverses.find(universe => universe.slug === slug) : undefined;
