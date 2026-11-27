import { movieUniverses } from '../../lib/franchises.js';
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({erro:'Método não permitido.'});}
  if(typeof req.query.id!=='string'||! /^[1-9][0-9]{0,9}$/.test(req.query.id))return res.status(400).json({erro:'Filme inválido.'});
  const data=await movieUniverses(Number(req.query.id));res.setHeader('Cache-Control',data.partial?'no-store':'public, s-maxage=86400');return res.json(data);
}
