import { getFranchiseIndex } from '../../lib/franchises.js';
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({erro:'Método não permitido.'});}
  const franchises=await getFranchiseIndex();
  // Partial failures retry promptly; successful individual sources still retain their 24h cache.
  res.setHeader('Cache-Control',franchises.some(row=>row.error)?'no-store':'public, s-maxage=86400');
  return res.json({franchises});
}
