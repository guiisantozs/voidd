import {allowCatalogSearch,consumptionFailure} from '../../lib/catalog-consumption.js';
import { parseProfileSearch,searchProfileMedia } from '../../lib/profile-search.js';
import {SEARCH_CACHE_HEADER} from '../../lib/catalog-cache-policy.js';
import {enrichAnimeArtwork} from '../../lib/anime-artwork.js';
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({erro:'Método não permitido.'});}
  if(!allowCatalogSearch(req,res))return;
  try{const params=parseProfileSearch(req.query),data=await searchProfileMedia(params);res.setHeader('Cache-Control',SEARCH_CACHE_HEADER);return res.status(200).json(params.media==='animes'?await enrichAnimeArtwork(data):data);}
  catch(error){res.setHeader('Cache-Control','no-store');return res.status(consumptionFailure(error,res)||(error.message==='INVALID'?400:error.message==='CONFIG'?503:502)).json({erro:error.message==='INVALID'?'Categoria, página ou busca inválida. Use pelo menos duas letras.':'Não foi possível pesquisar este catálogo agora.'});}
}
