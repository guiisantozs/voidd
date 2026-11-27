// TV identities are separate from film identities, even when numeric IDs collide.
// Selected live-action Phase 4–6 series, shared by the film/series portal.
export const marvelSeriesMultiverse = [85271,84958,88396,88329,92749,92782,92783,114472,122226,138501,202555,114471];

// Film-only editorial shelves; titles and chronology are curated below.
export const marvelUniverse = {
  hero: '/universos/marvel/doomsday.jpg',
  titleLogo: '/images/home/avengers-doomsday-logo.png',
  about: '/universos/marvel/spider-man.jpg',
  doomsdayId: 1003596,
  release: '2026-12-17T00:00:00-03:00',
  releaseLabel: '17 de dezembro de 2026',
  countdownStart: '2026-09-18T00:00:00-03:00',
  accent: '#3DDC84',
  accentSoft: '#1F6B4A',
  accentGlow: '#2FBF71',
  infinity: [1726,1724,10138,10195,1771,24428,68721,76338,100402,118340,99861,102899,271110,284052,283995,315635,284053,284054,299536,363088,299537,299534,429617],
  multiverse: [497698,566525,524434,634649,453395,616037,505642,640146,447365,609681,533535,822119,986056,617126,969681,1003596,1003598],
  chronology: [1771,299537,617126,1726,10138,1724,10195,24428,76338,68721,100402,118340,283995,99861,102899,271110,497698,284054,315635,284052,284053,363088,299536,299534,566525,429617,524434,634649,453395,505642,616037,640146,447365,609681,533535,822119,986056,969681],
};

// Series are positioned by their beginning, not by every season/episode.
// Anchors preserve the existing film sequence. Unplaced works stay at the end.
// TMDB identities are preserved; this grouping is an editorial selection.
const seriesAfterFilm = {
  1771:[61550], // Agent Carter
  24428:[1403], // Agents of S.H.I.E.L.D.
  283995:[61889,38472], // Daredevil, Jessica Jones (first seasons)
  102899:[62126,62127,62285], // Luke Cage, Iron Fist, The Defenders
  315635:[67178], // The Punisher
  299534:[84958,85271], // Loki, WandaVision
  566525:[88396], // The Falcon and the Winter Soldier
  453395:[88329,92749], // Hawkeye, Moon Knight
  505642:[114471,122226,92783,92782], // Ironheart, Echo, She-Hulk, Ms. Marvel
  447365:[114472], // Secret Invasion
  609681:[138501,202555], // Agatha All Along, Daredevil: Born Again
};
export const marvelCombinedChronology = marvelUniverse.chronology.flatMap(id=>[
  `filmes:${id}`,...(seriesAfterFilm[id]||[]).map(seriesId=>`series:${seriesId}`),
]);
