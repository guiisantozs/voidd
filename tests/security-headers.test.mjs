import test from 'node:test';
import assert from 'node:assert/strict';
import { contentSecurityPolicy } from '../lib/security-headers.js';

test('production CSP allows configured data origin and blocks inline/eval scripts and foreign connections', () => {
  const policy = contentSecurityPolicy({ supabaseUrl: 'https://example.supabase.co' });
  assert.match(policy, /script-src 'self';/);
  assert.match(policy, /script-src-attr 'none'/);
  assert.match(policy, /connect-src 'self' https:\/\/example.supabase.co wss:\/\/example.supabase.co;/);
  assert.equal(policy.includes('unsafe-eval'), false);
  assert.equal(policy.includes("script-src 'self' 'unsafe-inline'"), false);
  for (const supabaseUrl of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com/?x=1']) {
    assert.throws(() => contentSecurityPolicy({ supabaseUrl }));
  }
});
test('development CSP permits local Supabase and HMR without relaxing production', () => {
  const policy = contentSecurityPolicy({ development: true, supabaseUrl: 'http://127.0.0.1:54321' });
  assert.ok(policy.includes('unsafe-eval'));
  assert.ok(policy.includes('http://127.0.0.1:54321'));
  assert.ok(contentSecurityPolicy().includes("connect-src 'self';"));
});
