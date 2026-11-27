import {getAnimeSection,searchAnime,animeMetadata,getAnimeCredits} from '../../../lib/anime-catalog.js';
import {consumptionFailure,allowCatalogSearch} from '../../../lib/catalog-consumption.js';
import {enrichAnimeArtwork} from '../../../lib/anime-artwork.js';
import {animeDiscovery,animeDiscoveryCacheMs} from '../../../lib/anime-discovery.js';
export const config={maxDuration:60};
export default async function handler(req,res){
 if(req.query.section==='diagnostics'){
  res.setHeader('Cache-Control','private, no-store');
  if(process.env.NODE_ENV!=='development')return res.status(404).end();
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).end();}
  try{return res.json(await animeDiscovery.diagnosticReport());}catch{return res.status(502).json({error:'Discovery diagnostics unavailable'});}
 }
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({erro:'Método não permitido.'});}
 const {section,page='1',q='',genre='all',year='',cursor='1:0',ids='',genres='',id=''}=req.query;
 if([section,page,q,genre,year,cursor,ids,genres,id].some(v=>typeof v!=='string')||!/^\d{1,3}$/.test(page)||!/^([1-9]\d{0,2}):0$/.test(cursor))return res.status(400).json({erro:'Seleção inválida.'});
 if(section==='search'&&!allowCatalogSearch(req,res))return;
 if(['editorial','trending','hero','weekly'].includes(section)){
  try{const data=await animeDiscovery.section(section,Number(page));res.setHeader('Cache-Control',data.partial||data.stale?'no-store':`public, max-age=0, s-maxage=${animeDiscoveryCacheMs()/1000}`);return res.json(data);}
  catch(error){res.setHeader('Cache-Control','no-store');return res.status(consumptionFailure(error,res)||(error.message==='INVALID'?400:error.code==='JIKAN_RETIRED'||error.message==='CONFIG'?503:502)).json({...(error.code==='JIKAN_RETIRED'?{code:error.code}:{}),erro:error.code==='JIKAN_RETIRED'?error.message:'Não foi possível atualizar os destaques de animes. Tente novamente.'});}
 }
 try{const data=section==='search'?await searchAnime({q,genre,year,page:Number(cursor.split(':')[0])}):section==='metadata'?await animeMetadata(ids.split(',')):section==='credits'?await getAnimeCredits(id):await getAnimeSection(section,Number(page),{genres});res.setHeader('Cache-Control',data.partial||data.stale?'no-store':`public, max-age=0, s-maxage=${section==='search'?300:3600}`);const enriched=await enrichAnimeArtwork(data);return res.json(enriched);}
 catch(error){res.setHeader('Cache-Control','no-store');return res.status(consumptionFailure(error,res)||(error.message==='INVALID'?400:error.code==='JIKAN_RETIRED'||error.message==='CONFIG'?503:502)).json({...(error.code==='JIKAN_RETIRED'?{code:error.code}:{}),erro:error.code==='JIKAN_RETIRED'?error.message:error.message==='INVALID'?'Seleção inválida.':'O catálogo de animes está indisponível no momento.'});}
}
