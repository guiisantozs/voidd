import { similarGameCandidates } from '../../lib/game-similarity.js';

const cache = new Map();
export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ erro: 'Método não permitido.' }); }
  const id = req.query.id;
  if (typeof id !== 'string' || !/^[1-9]\d{0,9}$/.test(id)) return res.status(400).json({ erro: 'Jogo inválido.' });
  try {
    const cached = cache.get(id);
    const data = cached?.expires > Date.now() ? await cached.promise : await (() => {
      if (cache.size >= 200) cache.delete(cache.keys().next().value);
      const promise = similarGameCandidates(id).then(data => { if (data.partial) cache.delete(id); return data; }).catch(error => { cache.delete(id); throw error; });
      cache.set(id, { promise, expires: Date.now() + 3600000 }); return promise;
    })();
    res.setHeader('Cache-Control', data.partial ? 'no-store' : 'public, max-age=3600');
    return res.status(200).json(data);
  } catch { res.setHeader('Cache-Control', 'no-store'); return res.status(502).json({ erro: 'Jogos parecidos indisponíveis. Tente novamente.' }); }
}
