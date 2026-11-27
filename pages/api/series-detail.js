import {getSeriesDetail,getSeriesSeason,getSeriesProviders,getSeriesSimilar,getSeriesRecentEpisodes} from '../../lib/series-detail.js';
import {decodeAnimeId} from '../../lib/anime-provider.js';
import {getAnimeDetail,getAnimeSeason,getAnimeSimilar,getAnimeEpisode} from '../../lib/anime-catalog.js';
import {enrichAnimeArtwork} from '../../lib/anime-artwork.js';
import {animeDetailService} from '../../lib/anime-detail-service.js';
import {animeSimilar} from '../../lib/anime-similar.js';
import {animeEpisodes} from '../../lib/anime-episodes.js';
import {consumptionFailure} from '../../lib/catalog-consumption.js';
export const config={maxDuration:60};
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({erro:'Método não permitido.'});}
 const {id,part='detail',season='0',region='BR',page='1',media='series',episode='0'}=req.query;
 if(typeof id!=='string'||typeof part!=='string'||typeof region!=='string'||typeof season!=='string'||typeof page!=='string'||!['series','animes'].includes(media)||!/^\d{1,4}$/.test(season)||!/^\d{1,3}$/.test(page))return res.status(400).json({erro:'Endereço inválido.'});
 try{
  if(decodeAnimeId(id)){
   if(media!=='animes')throw Error('INVALID');
   if(part==='episode'){if(typeof episode!=='string'||!/^[1-9]\d{0,4}$/.test(episode))throw Error('INVALID');const data=await getAnimeEpisode(id,Number(episode));res.setHeader('Cache-Control','public, s-maxage=3600');return res.json(data);}
   if(part==='season'&&Number(season)!==1)throw Error('INVALID');
   const data=part==='detail'?await animeDetailService.detail(id):part==='season'?await animeEpisodes(id,Number(page)):part==='similar'?await animeSimilar(id):part==='recent'?{episodes:[]}:null;
   if(!data)throw Error('INVALID');res.setHeader('Cache-Control','public, s-maxage=3600');return res.json(data);
  }
  const data=part==='detail'?await getSeriesDetail(id):part==='season'?await getSeriesSeason(id,Number(season)):part==='providers'?await getSeriesProviders(id,region):part==='similar'?await getSeriesSimilar(id,Number(page)):part==='recent'?await getSeriesRecentEpisodes(id,{media}):null;
  if(!data)return res.status(400).json({erro:'Seção inválida.'});res.setHeader('Cache-Control',`public, s-maxage=${part==='providers'?21600:part==='recent'?600:3600}, stale-while-revalidate=300`);return res.json(data);
 }catch(error){res.setHeader('Cache-Control','no-store');return res.status(consumptionFailure(error,res)||(error.message==='INVALID'?400:error.status===404?404:error.message==='CONFIG'?503:502)).json({erro:'Não foi possível carregar esta seção.'});}
}
