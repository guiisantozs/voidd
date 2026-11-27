import {allowCatalogSearch,consumptionFailure} from '../../lib/catalog-consumption.js';
import { parseMovieSearch } from '../../lib/movie-search-options.js';
import { searchMovies } from '../../lib/movie-search.js';
import {SEARCH_CACHE_HEADER} from '../../lib/catalog-cache-policy.js';
export default async function handler(req,res) {
  if(req.method!=='GET') { res.setHeader('Allow','GET');return res.status(405).json({erro:'Método não permitido.'}); }
  let options;
  try { options=parseMovieSearch(req.query); } catch { return res.status(400).json({erro:'Confira a busca, o gênero e o ano (1874–2099).'}); }
  if(!allowCatalogSearch(req,res))return;
  try {
    const result=await searchMovies(options);
    res.setHeader('Cache-Control',SEARCH_CACHE_HEADER);return res.json(result);
  } catch(error) { return res.status(consumptionFailure(error,res)||(error.message==='CONFIG'?503:502)).json({erro:error.message==='CONFIG'?'A busca de filmes ainda não está configurada.':'Não foi possível buscar filmes. Tente novamente.'}); }
}
