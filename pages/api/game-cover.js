import { resolveGameCover as resolveCover } from '../../lib/game-cover-server.js';
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({erro:'Método não permitido.'});}
  const id=req.query.id;
  if(typeof id!=='string'||!/^\d{1,10}$/.test(id)||Number(id)<1)return res.status(400).json({erro:'Jogo inválido.'});
  try{
    const result=await resolveCover(id);
    res.setHeader('Cache-Control',result.status!==200?'no-store':result.body.cover?'public, max-age=3600, s-maxage=3600, stale-while-revalidate=300':'public, max-age=300, s-maxage=300');
    return res.status(result.status).json(result.body);
  }catch(error){res.setHeader('Cache-Control','no-store');return res.status(error.message==='CONFIG'?503:502).json({erro:'Capa temporariamente indisponível.'});}
}
