const baseHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Referrer-Policy': 'no-referrer', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' };
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
export function createVerificationHandler({ makeClient, url, publicKey, serviceKey, allowedOrigins = ['https://void-lake-ten.vercel.app'] }) {
  const origins = new Set(allowedOrigins);
  return async request => {
    const origin = request.headers.get('origin');
    const headers = { ...baseHeaders, ...(origins.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}) };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
    if (origin && !origins.has(origin)) return reply(403, { error: 'Origem não permitida.' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply(405, { error: 'Método não permitido.' });
    if (!url || !publicKey || !serviceKey) return reply(503, { error: 'Verificação indisponível.' });
    if (Number(request.headers.get('content-length')) > 12000) return reply(413, { error: 'Solicitação inválida.' });
    try {
      // Content-Length is optional and untrusted. Bound the actual stream too.
      const reader = request.body?.getReader();
      const chunks = []; let bytes = 0;
      if (reader) {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > 12000) { await reader.cancel(); return reply(413, { error: 'Solicitação inválida.' }); }
            chunks.push(value);
          }
        } finally { reader.releaseLock(); }
      }
      const content = new Uint8Array(bytes); let offset = 0;
      for (const chunk of chunks) { content.set(chunk, offset); offset += chunk.byteLength; }
      const raw = new TextDecoder().decode(content);
      let body;
      try { body = JSON.parse(raw); } catch { return reply(400, { error: 'Solicitação inválida.' }); }
      if (!body || typeof body !== 'object') return reply(400, { error: 'Solicitação inválida.' });
      const client = makeClient(url, publicKey, options);
      const admin = makeClient(url, serviceKey, options);

      if (body.action === 'legacy-login') {
        if (typeof body.email !== 'string' || body.email.length > 254 || typeof body.password !== 'string' || body.password.length > 4096) return reply(400, { error: 'Confira os dados de acesso.' });
        // Bind the lookup across password validation: an address must not be
        // reassigned to a different account during the request.
        const before = await admin.rpc('void_pending_email_account', { address: body.email.trim() });
        // Never unlock a pending account on a client's claim. Auth must first
        // return email_not_confirmed, which occurs AFTER password verification.
        const signed = await client.auth.signInWithPassword({ email: body.email.trim(), password: body.password, options: body.captchaToken ? { captchaToken: body.captchaToken } : undefined });
        if (!signed.error && signed.data?.session) return reply(200, { session: signed.data.session });
        if (signed.error?.code !== 'email_not_confirmed') return reply(signed.error?.status === 429 ? 429 : 400, { error: 'Não foi possível entrar. Confira os dados ou tente novamente em alguns minutos.' });
        const settings = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: publicKey }, signal: AbortSignal.timeout(8000) });
        if (!settings.ok || (await settings.json()).mailer_autoconfirm !== true) return reply(503, { error: 'O acesso imediato ainda não foi ativado neste ambiente.' });
        const found = await admin.rpc('void_pending_email_account', { address: body.email.trim() });
        if (before.error || found.error || !found.data || found.data !== before.data) return reply(400, { error: 'Não foi possível entrar. Confira os dados.' });
        const confirmed = await admin.auth.admin.updateUserById(found.data, { email_confirm: true });
        if (confirmed.error) return reply(502, { error: 'Não foi possível entrar agora.' });
        // This grants access only; no mailbox verification is recorded here.
        const retried = await client.auth.signInWithPassword({ email: body.email.trim(), password: body.password });
        if (retried.error || !retried.data?.session) return reply(400, { error: 'Não foi possível entrar agora. Tente novamente.' });
        return reply(200, { session: retried.data.session });
      }

      if (body.action === 'verify') {
        if (typeof body.token_hash !== 'string' || !/^[a-f0-9]{32,256}$/i.test(body.token_hash)) return reply(400, { error: 'Link inválido ou expirado. Solicite outro em Minha conta.' });
        // Explicit email-token verification: SMS/MFA/password sessions are not proof.
        const { data, error } = await client.auth.verifyOtp({ token_hash: body.token_hash, type: 'email' });
        if (error || !data.user?.email || !data.user.email_confirmed_at) return reply(error?.status === 429 ? 429 : 400, { error: 'Link inválido ou expirado. Solicite outro em Minha conta.' });
        const { error: saveError } = await admin.from('void_email_verifications').upsert({ user_id: data.user.id, verified_email: data.user.email.toLowerCase(), verified_at: new Date().toISOString() }, { onConflict: 'user_id' });
        if (saveError) return reply(502, { error: 'Não foi possível registrar a verificação. Solicite outro link em Minha conta.' });
        // Do not transfer a login session through an email verification link.
        if (data.session?.access_token) await admin.auth.admin.signOut(data.session.access_token, 'local');
        return reply(200, { verified: true });
      }

      if (body.action !== 'request' && body.action !== 'status') return reply(400, { error: 'Solicitação inválida.' });
      const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
      if (!token) return reply(401, { error: 'Entre novamente para continuar.' });
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user?.email) return reply(401, { error: 'Entre novamente para continuar.' });
      const user = data.user;
      const state = await admin.from('void_email_verifications').select('verified_email,verified_at,last_sent_at').eq('user_id', user.id).maybeSingle();
      if (state.error) return reply(502, { error: 'Não foi possível consultar a verificação.' });
      const verified = !!state.data?.verified_at && state.data.verified_email === user.email.toLowerCase();
      if (body.action === 'status' || verified) return reply(200, { verified, lastSentAt: state.data?.last_sent_at || null });
      const claim = await admin.rpc('void_email_verification_claim', { target: user.id });
      if (claim.error) return reply(502, { error: 'Não foi possível solicitar o e-mail.' });
      if (!claim.data) return reply(429, { error: 'Aguarde um minuto antes de reenviar.', retryAfter: 60 });
      // A caller cannot choose the recipient. Auth also validates the redirect
      // against its configured allowlist. No arbitrary external email service.
      const redirect = typeof body.redirectTo === 'string' ? body.redirectTo : '';
      let target;
      try { target = new URL(redirect); } catch { return reply(400, { error: 'Endereço de retorno inválido.' }); }
      if (!origins.has(target.origin) || target.pathname !== '/verificar-email' || target.search || target.hash || target.username || target.password) return reply(400, { error: 'Endereço de retorno inválido.' });
      const sent = await client.auth.signInWithOtp({ email: user.email, options: { shouldCreateUser: false, emailRedirectTo: target.href, ...(body.captchaToken ? { captchaToken: body.captchaToken } : {}) } });
      if (sent.error) return reply(sent.error.status === 429 ? 429 : 502, { error: sent.error.status === 429 ? 'Limite de envio atingido. Aguarde e tente novamente.' : 'Não foi possível enviar a verificação agora. Tente novamente mais tarde.', retryAfter: 60 });
      return reply(200, { sent: true, retryAfter: 60 });
    } catch { return reply(502, { error: 'Não foi possível concluir agora. Tente novamente.' }); }
  };
}
