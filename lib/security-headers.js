/**
 * Build a Pages Router CSP without enabling inline JavaScript in production.
 * Inline styles remain necessary for existing React styles and artwork framing.
 * @param {{development?: boolean, supabaseUrl?: string}} options
 * @returns {string}
 */
export function contentSecurityPolicy({ development = false, supabaseUrl = '' } = {}) {
  const connections = ["'self'"];
  if (supabaseUrl) {
    const url = new URL(supabaseUrl);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      (url.protocol !== 'https:' && !(development && local && url.protocol === 'http:'))
    ) {
      throw new Error('Invalid public Supabase origin.');
    }
    connections.push(url.origin, url.origin.replace(/^http/, 'ws'));
  }
  if (development) connections.push('ws://localhost:*', 'ws://127.0.0.1:*');
  return [
    "default-src 'self'",
    `script-src 'self'${development ? " 'unsafe-eval'" : ''}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data: blob:",
    "font-src 'self' data:",
    `connect-src ${connections.join(' ')}`,
    'frame-src https://www.youtube-nocookie.com',
    "media-src 'self' https: blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');
}
