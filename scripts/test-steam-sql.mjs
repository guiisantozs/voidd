// Isolated Postgres: npm install --prefix tmp/steam-db-check --no-save @electric-sql/pglite@0.3.14
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,service_role;`);
  await db.exec(await fs.readFile('supabase/migrations/20261026235022_steam_connections.sql', 'utf8'));
  await db.exec(await fs.readFile('supabase/tests/steam-connections.sql', 'utf8'));
  console.log('Steam SQL passed: isolation, forged writes, RPC grants, expiration, replay, uniqueness and disconnect.');
} finally { await db.close(); }
