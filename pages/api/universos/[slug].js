import { getFranchise } from '../../../lib/franchises.js';
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({erro:'Método não permitido.'});}
  try{const data=await getFranchise(req.query.slug);res.setHeader('Cache-Control',data.partial?'public, s-maxage=60':'public, s-maxage=86400');return res.json(data);}
  catch(error){return res.status(error.message==='NOT_FOUND'?404:error.message==='CONFIG'?503:502).json({erro:error.message==='NOT_FOUND'?'Universo não encontrado.':'Não foi possível carregar este universo. Tente novamente.'});}
}
