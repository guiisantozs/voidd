import { loadGameOverviewPart, OVERVIEW_PARTS } from '../../lib/game-overview-source.js';
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({erro:'Método não permitido.'});}
  const {id,part}=req.query;
  if(typeof id!=='string'||! /^[1-9]\d{0,9}$/.test(id)||!OVERVIEW_PARTS.includes(part))return res.status(400).json({erro:'Seleção inválida.'});
  try{const data=await loadGameOverviewPart(id,part);res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=600');return res.status(200).json({data});}
  catch{res.setHeader('Cache-Control','no-store');return res.status(502).json({erro:'Não foi possível carregar este bloco.'});}
}
