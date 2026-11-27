import { authPosters, configuredAuthProviders } from '../../lib/auth-scene.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ erro: 'Método não permitido.' }); }
  const [posters, providers] = await Promise.allSettled([authPosters(), configuredAuthProviders()]);
  // Provider configuration is refreshed more often than the 6h poster cache.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
  return res.json({ posters: posters.status === 'fulfilled' ? posters.value : [], providers: providers.status === 'fulfilled' ? providers.value : [] });
}
