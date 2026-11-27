import {animeUniverses} from '../../../config/animes.js';
export default function handler(req,res){if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({erro:'Método não permitido.'});}res.setHeader('Cache-Control','public, s-maxage=3600');return res.json({franchises:animeUniverses});}
