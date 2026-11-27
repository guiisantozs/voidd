import test from 'node:test';
import assert from 'node:assert/strict';
import { publicFileIssues } from '../scripts/check-public-files.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';

test('publicação bloqueia envs reais, arquivos gerados e templates preenchidos', () => {
  for (const name of ['.env', '.env.local', 'app/.env.production', 'tmp/debug.js', '.tmp/debug.js', '.next/server.js', 'private.pem', 'backups/export.sql', 'session.har']) {
    assert.ok(publicFileIssues(name, '').length, name);
  }
  assert.deepEqual(publicFileIssues('.env.local.example', '# Exemplo\nTMDB_API_KEY=cole_sua_chave_aqui\nNEXT_PUBLIC_SUPABASE_URL='), []);
  assert.ok(publicFileIssues('.env.local.example', 'TMDB_API_KEY=valor-preenchido').length);
  assert.deepEqual(publicFileIssues('.env.example', 'SUPABASE_SERVICE_ROLE_KEY=\nNEXT_PUBLIC_SUPABASE_URL='), []);
  assert.ok(publicFileIssues('.env.example', 'SUPABASE_SERVICE_ROLE_KEY=filled').length);
});

test('scanner distinguishes public anon JWTs from privileged and session tokens', () => {
  const jwt = claims => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.signature';
  assert.deepEqual(publicFileIssues('example.js', jwt({ role: 'anon', exp: 9999999999 })), []);
  assert.ok(publicFileIssues('example.js', jwt({ role: 'service_role' })).length);
  assert.ok(publicFileIssues('example.js', jwt({ sub: 'account' })).length);
  assert.ok(publicFileIssues('example.js', ['postgresql://user', 'password@localhost/database'].join(':')).length);
});
test('scanner detecta segredos conhecidos sem bloquear referências a variáveis', () => {
  const secret = ['segredo', 'somente', 'teste'].join('-');
  assert.ok(publicFileIssues('lib/example.js', `const value = '${secret}';`, [secret]).length);
  assert.deepEqual(publicFileIssues('lib/api.js', 'const key = process.env.TMDB_API_KEY;'), []);
  const privateKey = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
  assert.ok(publicFileIssues('lib/api.js', privateKey).length);
});

test('CLI scans empty and multi-chunk Git blobs, fails on a secret without printing it', () => {
  fs.mkdirSync('tmp', { recursive: true });
  const root = fs.mkdtempSync(path.resolve('tmp/scanner-fixture-'));
  const git = (...args) => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args], { cwd: root, stdio: 'pipe' });
  git('init', '--quiet');
  fs.writeFileSync(path.join(root, 'empty.txt'), '');
  fs.writeFileSync(path.join(root, 'large.bin'), Buffer.alloc(2 * 1024 * 1024));
  git('add', '.');
  const run = () => spawnSync(process.execPath, [path.resolve('scripts/check-public-files.mjs')], { cwd: root, encoding: 'utf8' });
  const clean = run();
  assert.equal(clean.status, 0, clean.stderr);
  const secret = ['sb_', 'secret_', 'synthetic'.repeat(8)].join('');
  fs.appendFileSync(path.join(root, 'large.bin'), secret);
  git('add', '.');
  const blocked = run();
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /large\.bin/);
  assert.equal((blocked.stdout + blocked.stderr).includes(secret), false);
  // Keep only synthetic fixtures under ignored tmp; never touch the user's Git.
});
