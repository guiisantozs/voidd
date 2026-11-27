import { parseGameSearch } from '../../lib/game-search.js';
import { recentRecommendationCandidates } from '../../lib/game-recommendation-source.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ erro: 'Método não permitido.' }); }
  try {
    const options = parseGameSearch({ platform: req.query.platform, genre: req.query.genre, page: req.query.page });
    if (options.page > 2) throw new Error('INVALID');
    const data = await recentRecommendationCandidates(options);
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(data);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(error.message === 'INVALID' ? 400 : error.message === 'CONFIG' ? 503 : 502).json({ erro: 'Não foi possível carregar jogos recomendados recentes.' });
  }
}
