import { getMovieSection } from '../../../lib/movie-catalog.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ erro: 'Método não permitido.' }); }
  const { section, page = '1' } = req.query;
  if (typeof section !== 'string' || typeof page !== 'string' || !/^[1-9][0-9]{0,2}$/.test(page)) return res.status(400).json({ erro: 'Seção ou página inválida.' });
  try {
    const data = await getMovieSection(section, Number(page));
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
    return res.status(200).json(data);
  } catch (error) {
    const status = error.message === 'INVALID' ? 400 : error.message === 'CONFIG' ? 503 : 502;
    return res.status(status).json({ erro: status === 400 ? 'Seção ou página inválida.' : 'Esta seleção de filmes está indisponível no momento.' });
  }
}
