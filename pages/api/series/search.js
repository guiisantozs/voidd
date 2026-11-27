import {allowCatalogSearch,consumptionFailure} from '../../../lib/catalog-consumption.js';
import {parseMovieSearch} from '../../../lib/movie-search-options.js';
import {seriesGenreNames} from '../../../config/series.js';
import {searchSeries} from '../../../lib/series-catalog.js';
import {SEARCH_CACHE_HEADER} from '../../../lib/catalog-cache-policy.js';
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({erro:'Método não permitido.'});}
 let options;try{options=parseMovieSearch(req.query,Object.entries(seriesGenreNames));}catch{return res.status(400).json({erro:'Confira o título, o gênero e o ano (1874–2099).'});}
 if(!allowCatalogSearch(req,res))return;
 try{const data=await searchSeries(options);res.setHeader('Cache-Control',SEARCH_CACHE_HEADER);return res.json(data);}catch(error){res.setHeader('Cache-Control','no-store');return res.status(consumptionFailure(error,res)||502).json({erro:'Não foi possível buscar séries. Tente novamente.'});}
}
