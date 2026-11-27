export const workHref = item => item.categoria === 'filmes' ? `/filme/${encodeURIComponent(String(item.id))}` : `/obra/${item.categoria}/${encodeURIComponent(String(item.id))}`;

export async function fetchWork(category, id, signal) {
  const query = new URLSearchParams({ categoria: category, id });
  const response = await fetch(`/api/obra?${query}`, { signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.erro || 'Não foi possível carregar esta obra.');
  return data.obra;
}
