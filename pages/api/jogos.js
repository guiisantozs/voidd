import {allowCatalogSearch,consumptionFailure} from '../../lib/catalog-consumption.js';
﻿import { parseGameSearch, searchGames } from '../../lib/game-search.js';
import { gameCatalogError } from '../../lib/game-catalog-error.js';
import {SEARCH_CACHE_HEADER} from '../../lib/catalog-cache-policy.js';
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ erro: 'Método não permitido.' });
  }
  if(!allowCatalogSearch(req,res))return;
  try {
    const data = await searchGames(parseGameSearch(req.query));
    res.setHeader('Cache-Control', SEARCH_CACHE_HEADER);
    return res.status(200).json(data);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    if (error.message === 'INVALID') return res.status(400).json({ erro: 'Busca ou filtros inválidos.' });
    const failure = gameCatalogError(error, 'Não foi possível consultar os jogos. Tente novamente.');
    return res.status(consumptionFailure(error,res)||failure.status).json(failure.body);
  }
}
