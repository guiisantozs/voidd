import { getSimilarMovies } from '../../lib/movie-detail.js';
import { validateWork } from '../../lib/details.js';
export default async function handler(req,res) {
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({erro:'Método não permitido.'});}
  const page=Number(req.query.page || 1);
  if(!validateWork('filmes',req.query.id)||!Number.isInteger(page)||page<1||page>500)return res.status(400).json({erro:'Filme ou página inválidos.'});
  try{const data=await getSimilarMovies(req.query.id,page);res.setHeader('Cache-Control',data.partial?'public, s-maxage=60':'public, s-maxage=3600, stale-while-revalidate=600');return res.status(200).json(data);}
  catch{return res.status(502).json({erro:'Não foi possível carregar os filmes semelhantes.'});}
}
