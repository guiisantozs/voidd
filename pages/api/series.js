import {getSeriesSection} from '../../lib/series-catalog.js';
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({erro:'Método não permitido.'});}
 try{const data=await getSeriesSection('trending');res.setHeader('Cache-Control','public, s-maxage=3600');return res.json({series:data.movies});}
 catch{res.setHeader('Cache-Control','no-store');return res.status(502).json({erro:'Não foi possível carregar as séries.'});}
}
