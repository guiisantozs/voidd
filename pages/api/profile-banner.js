import { movieArtwork, parseArtworkId } from '../../lib/profile-artwork.js';
export default async function handler(req,res) {
  if(req.method !== 'GET') {res.setHeader('Allow','GET');return res.status(405).json({erro:'Método não permitido.'});}
  try {
    const data = await movieArtwork(parseArtworkId(req.query.id));
    res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=3600');
    return res.status(200).json(data);
  } catch(error) {return res.status(error.message==='INVALID'?400:error.message==='CONFIG'?503:502).json({erro:error.message==='INVALID'?'Filme inválido.':'Não foi possível carregar as imagens deste filme.'});}
}
