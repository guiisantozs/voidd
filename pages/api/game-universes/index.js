import { loadGameUniverseIndex } from '../../../lib/game-universes.js';
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({erro:'Método não permitido.'});}
  const universes=await loadGameUniverseIndex();
  if(universes.every(universe=>universe.error)){res.setHeader('Cache-Control','no-store');return res.status(503).json({erro:'Não foi possível carregar as contagens dos universos. Tente novamente.'});}
  res.setHeader('Cache-Control',universes.some(universe=>universe.error)?'no-store':'public, s-maxage=3600, stale-while-revalidate=600');
  return res.status(200).json({universes});
}
