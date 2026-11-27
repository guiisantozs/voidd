import {decodeAnimeId} from '../../lib/anime-provider.js';
import {animeFranchise} from '../../lib/anime-franchise.js';
import {animeSimilar} from '../../lib/anime-similar.js';
import {animePeople} from '../../lib/anime-people.js';
export const config={maxDuration:60};
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).end();}
 const {id,part}=req.query;if(typeof id!=='string'||!decodeAnimeId(id)||!['franchise','similar','characters','staff','music'].includes(part))return res.status(400).json({erro:'Seleção inválida.'});
 try{const data=await (part==='franchise'?animeFranchise:part==='similar'?animeSimilar:animePeople[part])(id);res.setHeader('Cache-Control',data.partial?'no-store':'public, max-age=0, s-maxage=3600');return res.json(data);}catch{res.setHeader('Cache-Control','no-store');return res.status(502).json({erro:'Não foi possível carregar esta seleção.'});}
}
