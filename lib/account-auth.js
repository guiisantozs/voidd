export const RECOVERY_KEY = 'void:password-recovery:v1';
export const RECOVERY_NOTICE = 'Se houver uma conta para esse e-mail, você receberá o link de recuperação. Confira também a pasta de spam.';
export const emailIsValid = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
export async function sendAccountEmail(client, action, email, origin) {
  if (!emailIsValid(email)) throw new Error('EMAIL');
  if (!client) throw new Error('CONFIG');
  const redirectTo = new URL('/conta', origin).href;
  let result;
  if (action === 'recovery') result = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  else throw new Error('ACTION');
  if (result.error) throw result.error;
}
export function authErrorMessage(error, signup = false) {
  if (error?.code === 'email_not_confirmed') return 'O acesso imediato ainda não está disponível neste ambiente. Tente novamente mais tarde.';
  if (error?.code === 'invalid_credentials') return 'E-mail ou senha incorretos. Confira os dados e tente novamente.';
  if (error?.status === 429 || ['over_email_send_rate_limit', 'over_request_rate_limit'].includes(error?.code)) return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos antes de tentar novamente.';
  if (error?.code === 'email_address_not_authorized') return 'O envio de e-mails deste projeto ainda está restrito. É necessário configurar o serviço de e-mail no Supabase.';
  if (error?.code === 'weak_password') return 'A senha não atende à política do projeto. Use pelo menos 8 caracteres e confira os requisitos.';
  return signup ? 'Não foi possível cadastrar. Confira os dados e tente novamente.' : 'Não foi possível entrar. Confira os dados e sua conexão.';
}
export function authLinkMessage(search = '', hash = '') {
  const query = new URLSearchParams(search.replace(/^\?/, ''));
  const fragment = new URLSearchParams(hash.replace(/^#/, ''));
  const code = fragment.get('error_code') || query.get('error_code');
  if (!code && !fragment.has('error') && !query.has('error')) return '';
  return code === 'otp_expired' ? 'Este link expirou ou já foi usado. Reenvie a confirmação ou solicite um novo link de recuperação.' : 'Não foi possível validar esse link. Solicite um novo e-mail e tente novamente.';
}
export function markRecovery(storage, id, now = Date.now()) {
  storage.setItem(RECOVERY_KEY, JSON.stringify({ id, at: now }));
}
export function recoveryPending(storage, id, now = Date.now()) {
  try {
    const value = JSON.parse(storage.getItem(RECOVERY_KEY) || 'null');
    return !!id && value?.id === id && now >= value.at && now - value.at < 30 * 60 * 1000;
  } catch { return false; }
}
