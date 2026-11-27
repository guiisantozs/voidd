import {getSeriesUniverseIndex} from '../../../../lib/series-universes.js';
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({erro:'Método não permitido.'});}
  const franchises=await getSeriesUniverseIndex();
  res.setHeader('Cache-Control',franchises.some(row=>row.error||row.partial)?'no-store':'public, s-maxage=3600');
  return res.json({franchises});
}
