import { getWork, validateWork } from '../../lib/details.js';
import {consumptionFailure} from '../../lib/catalog-consumption.js';
export const config={maxDuration:60};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ erro: 'Método não permitido.' });
  }
  const { categoria, id } = req.query;
  if (!validateWork(categoria, id)) return res.status(400).json({ erro: 'Categoria ou identificador inválido.' });
  try {
    const obra = await getWork(categoria, id);
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ obra });
  } catch (error) {
    if(error.code==='JIKAN_RETIRED'){res.setHeader('Cache-Control','no-store');return res.status(503).json({code:error.code,erro:error.message});}
    const status = consumptionFailure(error,res)||(error.message === 'CONFIG' ? 503 : error.status === 404 ? 404 : 502);
    const erro = status === 503 ? categoria==='animes'?'O catálogo de animes está temporariamente indisponível.':'Integração não configurada. Preencha as chaves no .env.local.'
      : status === 404 ? 'Obra não encontrada no provedor.' : 'Não foi possível carregar esta obra. Tente novamente.';
    return res.status(status).json({ erro });
  }
}
