import { loadGameHighlights } from '../../lib/game-highlights.js';
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({erro:'Método não permitido.'});}
  const page=req.query.page||'1';
  if(typeof page!=='string'||!/^\d{1,4}$/.test(page)||Number(page)<1)return res.status(400).json({erro:'Página inválida.'});
  try{const data=await loadGameHighlights({mode:'upcoming',page:Number(page)});res.setHeader('Cache-Control','public, s-maxage=300');return res.status(200).json(data);}
  catch{return res.status(502).json({erro:'Não foi possível carregar os lançamentos. Tente novamente.'});}
}
