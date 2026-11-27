import {getSeriesUniverse} from '../../../../lib/series-universes.js';
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({erro:'Método não permitido.'});}
  try{
    const data=await getSeriesUniverse(req.query.slug);
    res.setHeader('Cache-Control',data.partial?'no-store':'public, s-maxage=3600');
    return res.json(data);
  }catch(error){return res.status(error.message==='NOT_FOUND'?404:502).json({erro:error.message==='NOT_FOUND'?'Universo não encontrado.':'Não foi possível carregar este universo de séries. Tente novamente.'});}
}
