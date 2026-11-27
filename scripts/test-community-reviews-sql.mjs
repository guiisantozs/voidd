// Isolated Postgres only; no hosted fixture writes or environment files.
// node scripts/test-community-reviews-sql.mjs ./tmp/lists-db-check/node_modules/@electric-sql/pglite/dist/index.js
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
if (!process.argv[2]) throw Error('Informe o caminho do módulo PGlite temporário.');
const { PGlite } = await import(pathToFileURL(path.resolve(process.argv[2])).href);
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create schema void_private;
    create table auth.users(id uuid primary key, created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,void_private to anon,authenticated;`);
  for (const file of ['202610200001_accounts.sql', '20261020142708_movie_community.sql']) {
    await db.exec(await fs.readFile(`supabase/migrations/${file}`, 'utf8'));
  }
  // Use the actual profile schema, helper and policies, without unrelated RPCs.
  const profiles = await fs.readFile('supabase/migrations/20261020192337_user_profiles_follows.sql', 'utf8');
  await db.exec(profiles.slice(0, profiles.indexOf('create function void_private.profile_defaults'))
    + profiles.slice(profiles.indexOf('create table public.follows'), profiles.indexOf('create table public.profile_favorites')) + 'commit;');
  await db.exec(await fs.readFile('supabase/migrations/20261026131524_community_confirmed_friend_reviews.sql', 'utf8'));
  await db.exec(await fs.readFile('supabase/tests/community-friend-reviews.sql', 'utf8'));
  console.log('SQL passed: accepted friends in both directions, pending/follow exclusion, profile and review RLS, account isolation, search/count/window and revoked friendships.');
} finally { await db.close(); }
