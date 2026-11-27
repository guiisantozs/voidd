import { gamerMediaSource } from '../../lib/gamer-profile-server.js';

export function createGamerMediaHandler(source = gamerMediaSource) {
  return async function handler(req,res) {
    if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({erro:'Método não permitido.'});}
    try {
      const {id,ids}=req.query;
      if(typeof id==='string' && !ids && /^[1-9][0-9]{0,9}$/.test(id)) {
        const item=await source.media(id);res.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=600');return res.status(200).json({item});
      }
      if(typeof ids!=='string'||id)throw Error('INVALID');
      const list=[...new Set(ids.split(','))];
      if(!list.length||list.length>8||list.some(id=>!/^[1-9][0-9]{0,9}$/.test(id)))throw Error('INVALID');
      const items=[];let partial=false;
      for(let i=0;i<list.length;i+=4){const results=await Promise.allSettled(list.slice(i,i+4).map(id=>source.details(id)));for(const result of results){if(result.status==='fulfilled')items.push(result.value);else partial=true;}}
      res.setHeader('Cache-Control',partial?'no-store':'public, s-maxage=3600, stale-while-revalidate=600');
      return res.status(200).json({items,partial});
    } catch(error) {res.setHeader('Cache-Control','no-store');return res.status(error.message==='INVALID'?400:502).json({erro:error.message==='INVALID'?'Jogo ou seleção inválida.':'Não foi possível carregar as artes deste jogo. Tente novamente.'});}
  };
}
export default createGamerMediaHandler();
