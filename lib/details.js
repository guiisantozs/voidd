import { fetchJson } from './api.js';
import { getMovieDetail } from './movie-detail.js';
import { getSeriesDetail } from './series-detail.js';
import { gameOverviewFacts } from './game-overview.js';
import {useIGDBCatalog,decodeIGDBGameId} from './game-provider.js';
import {igdbCatalog} from './igdb-catalog.js';
import {decodeAnimeId} from './anime-provider.js';
import {getAnimeDetail} from './anime-catalog.js';
import {enrichAnimeArtwork} from './anime-artwork.js';
import {animeDetailService} from './anime-detail-service.js';

export function validateWork(category, id) {
  return typeof id === 'string' && ['filmes', 'series', 'animes', 'jogos'].includes(category) && /^[1-9][0-9]{0,9}$/.test(id);
}

function apiKey(name) {
  const key = process.env[name];
  if (!key || key === 'cole_sua_chave_aqui') throw new Error('CONFIG');
  return key;
}

export async function getWork(category, id) {
  if (!validateWork(category, id)) throw Object.assign(new Error('INVALID'), { status: 400 });
  if (category === 'filmes') return getMovieDetail(id);
  if (category === 'series') return getSeriesDetail(id);
  if(category==='animes'){if(decodeAnimeId(id))return animeDetailService.detail(id);const legacy=await getSeriesDetail(id);if(!legacy.isAnime)throw Object.assign(Error('NOT_FOUND'),{status:404});return {...legacy,categoria:'animes',provider:'tmdb',providerId:Number(id)};}
  if (category === 'jogos') {
    if(useIGDBCatalog()||decodeIGDBGameId(id))return igdbCatalog.detail(id);
    const url = new URL(`https://api.rawg.io/api/games/${id}`);
    url.searchParams.set('key', apiKey('RAWG_API_KEY'));
    const data = await fetchJson(url);
    return { id: data.id, categoria: category, titulo: data.name, poster: data.background_image || null,
      backdrop: data.background_image_additional || data.background_image || null,
      overviewFacts:gameOverviewFacts(data), plataformas: (data.parent_platforms || []).map(entry => entry.platform?.name).filter(Boolean),
      estreia: data.released || null, sinopse: data.description_raw || '', ano: (data.released || '').slice(0, 4),
      nota: data.ratings_count > 0 ? data.rating : null, genreIds: (data.genres || []).map(g => g.id), generos: (data.genres || []).map(g => g.name), creditos: [],
      informacoes: [
        { label: 'Classificação indicativa', valor: data.esrb_rating?.name || '' },
        { label: 'Modos de jogo', valor: (data.tags || []).filter(tag => ['singleplayer', 'multiplayer', 'co-op', 'online-co-op', 'local-co-op'].includes(tag.slug)).map(tag => ({singleplayer:'Um jogador',multiplayer:'Multiplayer','co-op':'Cooperativo','online-co-op':'Cooperativo online','local-co-op':'Cooperativo local'}[tag.slug])).join(', ') },
        { label: 'Tempo médio jogado · RAWG', valor: Number.isFinite(data.playtime) && data.playtime > 0 ? `${data.playtime} h (não é o tempo para zerar)` : '' },
        { label: 'Plataformas', valor: (data.platforms || []).map(p => p.platform?.name).filter(Boolean).join(', ') },
        { label: 'Desenvolvimento', valor: (data.developers || []).map(d => d.name).join(', ') },
        { label: 'Publicação', valor: (data.publishers || []).map(p => p.name).join(', ') },
      ].filter(info => info.valor), fonte: 'RAWG', fonteUrl: `https://rawg.io/games/${encodeURIComponent(data.slug || id)}`,
    };
  }
  const type = category === 'filmes' ? 'movie' : 'tv';
  const url = new URL(`https://api.themoviedb.org/3/${type}/${id}`);
  url.searchParams.set('api_key', apiKey('TMDB_API_KEY'));
  url.searchParams.set('language', 'pt-BR');
  url.searchParams.set('append_to_response', 'credits');
  const data = await fetchJson(url);
  const duration = data.runtime || data.episode_run_time?.[0];
  return { id: data.id, categoria: category, titulo: data.title || data.name,
    poster: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null,
    sinopse: data.overview || '', ano: (data.release_date || data.first_air_date || '').slice(0, 4),
    tmdbRating: data.vote_average ?? null, tmdbVoteCount: data.vote_count ?? 0,
    nota: data.vote_count > 0 ? data.vote_average / 2 : null,
    genreIds: (data.genres || []).map(g => g.id), generos: (data.genres || []).map(g => g.name),
    creditos: (data.credits?.cast || []).slice(0, 8).map(person => ({ nome: person.name, papel: person.character || '' })),
    informacoes: [
      { label: type === 'movie' ? 'Duração' : 'Duração por episódio', valor: duration ? `${duration} min` : '' },
      { label: 'Temporadas', valor: data.number_of_seasons ? String(data.number_of_seasons) : '' },
      { label: 'Episódios', valor: data.number_of_episodes ? String(data.number_of_episodes) : '' },
      { label: 'Direção', valor: (data.credits?.crew || []).filter(p => p.job === 'Director').map(p => p.name).join(', ') },
      { label: 'Criação', valor: (data.created_by || []).map(p => p.name).join(', ') },
    ].filter(info => info.valor), fonte: 'TMDB', fonteUrl: `https://www.themoviedb.org/${type}/${id}`,
  };
}
