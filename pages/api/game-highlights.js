import {createGameHomeCache} from '../../lib/game-home.js';
import {gameCatalogError} from '../../lib/game-catalog-error.js';
const home=createGameHomeCache();
export const config={maxDuration:60};

export function createGameHighlightsHandler(getHome=home){return async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ erro: 'Método não permitido.' }); }
  try {
    const data=await getHome();
    const seconds=data.partial?60:Math.max(1,Math.min(86400,Math.floor((data.refreshAt-Date.now())/1000)));
    res.setHeader('Cache-Control',`public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=60, stale-if-error=604800`);
    return res.status(200).json(data);
  } catch (error) {
    res.setHeader('Cache-Control','no-store');
    const failure=gameCatalogError(error,'Não foi possível carregar as seleções de jogos. Tente novamente.');
    return res.status(failure.status).json(failure.body);
  }
};}
export default createGameHighlightsHandler();
