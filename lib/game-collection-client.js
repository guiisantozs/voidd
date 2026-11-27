export async function collectionRequest(client, userId, { method = 'GET', body, query = {}, signal } = {}) {
 const headers = {};
 if (client) {
  const { data, error } = await client.auth.getSession();
  if (error || (userId && data.session?.user?.id !== userId)) throw Error('Sua conta mudou. Entre novamente para continuar.');
  if (data.session) headers.Authorization = 'Bearer ' + data.session.access_token;
 }
 if (body) headers['Content-Type'] = 'application/json';
 const timeout = AbortSignal.timeout(55000);
 const response = await fetch('/api/game-collection?' + new URLSearchParams(query), { method, headers, credentials: 'same-origin', ...(body ? { body: JSON.stringify(body) } : {}), signal: signal ? AbortSignal.any([timeout, signal]) : timeout });
 const data = await response.json();
 if (!response.ok) throw Object.assign(Error(data.message || 'A coleção está indisponível. Tente novamente.'), { status: response.status });
 return data;
}
export function extractFamilyAuthorization(input) {
 const value = typeof input === 'string' ? input.trim() : '';
 if (!value || value.length > 16000) return null;
 let token = value;
 if (value.startsWith('{')) {
  try { const data = JSON.parse(value); token = data.data?.webapi_token || data.webapi_token; } catch { return null; }
 }
 return typeof token === 'string' && token.length <= 12000 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) ? token : null;
}
export async function syncGameCollection(client, userId, { onProgress, signal, familyToken = null } = {}) {
 for (let batches = 0; batches <= 10000; batches++) {
  if (signal?.aborted) throw new DOMException('Sincronização interrompida.', 'AbortError');
  const result = await collectionRequest(client, userId, { method: 'POST', body: familyToken === null ? { action: 'sync' } : { action: 'sync-family', familyToken }, signal });
  familyToken = null;
  onProgress?.(result);
  if (result.done) return result;
 }
 throw Error('A sincronização precisa ser retomada para terminar.');
}
