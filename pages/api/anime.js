import {consumptionFailure} from '../../lib/catalog-consumption.js';
import {animeDiscovery,animeDiscoveryCacheMs} from '../../lib/anime-discovery.js';
export const config={maxDuration:60};
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({erro:'Método não permitido.'});}
 try{const data=await animeDiscovery.section('trending');res.setHeader('Cache-Control',data.partial||data.stale?'no-store':`public, s-maxage=${animeDiscoveryCacheMs()/1000}`);return res.json({animes:data.movies,partial:!!data.partial,stale:!!data.stale,discoveryVersion:data.discoveryVersion});}
 catch(error){res.setHeader('Cache-Control','no-store');return res.status(consumptionFailure(error,res)||(error.code==='JIKAN_RETIRED'||error.message==='CONFIG'?503:502)).json({erro:error.code==='JIKAN_RETIRED'?error.message:'Não foi possível carregar os animes.'});}
}
