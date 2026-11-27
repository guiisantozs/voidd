import { gameUniverseBySlug } from '../../../game-universes.config.js';
import { loadGameUniverse } from '../../../lib/game-universes.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ erro: 'Método não permitido.' }); }
  if (!gameUniverseBySlug(req.query.slug)) return res.status(404).json({ erro: 'Universo de jogos não encontrado.' });
  try {
    const data = await loadGameUniverse(req.query.slug);
    res.setHeader('Cache-Control', data.partial ? 'no-store' : 'public, s-maxage=3600, stale-while-revalidate=600');
    return res.status(200).json(data);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(['CONFIG','IGDB_CONFIG'].includes(error.message) ? 503 : 502).json({ erro: 'Não foi possível carregar os jogos deste universo. Tente novamente.' });
  }
}
