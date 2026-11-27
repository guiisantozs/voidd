import { fetchJson } from './api.js';
import { normalizeGame } from './game-search.js';
import { parentPlatforms } from './game-filters.js';
import { validReleaseDate } from './movie-release.js';
import { recommendationWindow, RECOMMENDED_MIN_RATING, RECOMMENDED_MIN_VOTES, RECOMMENDED_MIN_ADDED } from './game-recommendations.js';
import {useIGDBCatalog} from './game-provider.js';
import {igdbCatalog} from './igdb-catalog.js';

export async function recentRecommendationCandidates({ platform = 'all', genre = 'all', page = 1, now = new Date(), fetcher = fetchJson, key = process.env.RAWG_API_KEY } = {}) {
  if(useIGDBCatalog()&&fetcher===fetchJson){
    const {from,to}=recommendationWindow(now);
    const data=await igdbCatalog.search({platform,genre,page,order:'popular',releasedFrom:from,releasedTo:to,minVotes:RECOMMENDED_MIN_VOTES,minRating:RECOMMENDED_MIN_RATING});
    return {...data,jogos:data.jogos.filter(g=>g.estreia>=from&&g.estreia<=to&&g.catalogVotes>=RECOMMENDED_MIN_VOTES&&g.nota>=RECOMMENDED_MIN_RATING),basis:{from,to,source:'IGDB'}};
  }
  if (!key || key === 'cole_sua_chave_aqui') throw new Error('CONFIG');
  const basis = { ...recommendationWindow(now), minRating: RECOMMENDED_MIN_RATING, minVotes: RECOMMENDED_MIN_VOTES, minAdded: RECOMMENDED_MIN_ADDED };
  const url = new URL('https://api.rawg.io/api/games');
  url.search = new URLSearchParams({ key, dates: `${basis.from},${basis.to}`, ordering: '-added', page_size: '40', page: String(page), exclude_additions: 'true' });
  if (platform !== 'all') url.searchParams.set('parent_platforms', parentPlatforms[platform]);
  if (genre !== 'all') url.searchParams.set('genres', genre);
  const data = await fetcher(url);
  const jogos = (data.results || []).filter(item => Number.isInteger(item.id) && item.id > 0 && item.name && item.background_image
    && validReleaseDate(item.released) && item.released >= basis.from && item.released <= basis.to && item.rating >= basis.minRating && item.ratings_count >= basis.minVotes && item.added >= basis.minAdded)
    .map(item => ({ ...normalizeGame(item), fonte: 'RAWG', rawgRatingCount: item.ratings_count, rawgAdded: item.added }));
  return { jogos, pagination: { hasNext: !!data.next, page }, basis };
}
