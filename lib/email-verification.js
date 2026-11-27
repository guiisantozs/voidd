export const AUTH_COOLDOWN_MS = 60000;
export const authCooldownKey = (action, id = 'guest') => `void:auth-cooldown:${action}:${id}:v1`;
export function cooldownRemaining(storage, key, now = Date.now()) {
  try {
    const until = Number(storage.getItem(key));
    return Number.isFinite(until) ? Math.max(0, Math.min(60, Math.ceil((until - now) / 1000))) : 0;
  } catch { return 0; }
}
export function startAuthCooldown(storage, key, now = Date.now()) {
  try { storage.setItem(key, String(now + AUTH_COOLDOWN_MS)); } catch { /* Server limits still apply. */ }
}
export async function emailVerification(client, body) {
  if (!client) throw new Error('O serviço de conta não está disponível.');
  const { data, error } = await client.functions.invoke('void-email-verification', { body });
  if (error) {
    let detail;
    try { detail = await error.context?.json(); } catch { /* Never expose raw upstream errors. */ }
    throw new Error(detail?.error || 'Não foi possível concluir a verificação agora. Tente novamente.');
  }
  return data;
}
export async function signInWithOptionalEmail(client, credentials) {
  const result = await client.auth.signInWithPassword(credentials);
  if (result.error?.code !== 'email_not_confirmed') return result;
  const data = await emailVerification(client, { action: 'legacy-login', ...credentials });
  if (!data?.session?.access_token || !data.session.refresh_token) throw new Error('Não foi possível entrar agora.');
  return client.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
}
