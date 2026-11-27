export async function steamRequest(client, userId, { method = 'GET', action, fetcher = fetch } = {}) {
  const { data, error } = await client.auth.getSession();
  if (error || data.session?.user?.id !== userId) throw Error('Entre novamente no VOID para continuar.');
  const response = await fetcher('/api/steam', {
    method,
    credentials: 'same-origin',
    headers: { Authorization: 'Bearer ' + data.session.access_token, ...(action ? { 'Content-Type': 'application/json' } : {}) },
    ...(action ? { body: JSON.stringify({ action }) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.message || 'Não foi possível conectar à Steam. Tente novamente.');
  return result;
}
