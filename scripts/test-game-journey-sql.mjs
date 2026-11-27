// Isolated Postgres only: node scripts/test-game-journey-sql.mjs
// Uses the existing test-only PGlite installation, never hosted Supabase.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create schema void_private; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,void_private to anon,authenticated;`);
  await db.exec(await fs.readFile('supabase/migrations/202610200001_accounts.sql', 'utf8'));
  await db.exec(`alter table public.void_records add column is_public boolean generated always as(kind='review' and coalesce((payload->>'public')::boolean,false)) stored;
    grant select on public.void_records to anon;
    create policy records_public on public.void_records for select to anon using(is_public);
    insert into auth.users values('00000000-0000-4000-8000-000000000001');
    insert into public.void_records(user_id,kind,item_key,payload,updated_at) values('00000000-0000-4000-8000-000000000001','library','42','{"item":{"id":42,"categoria":"jogos","titulo":"Legacy"},"status":"finished"}', '2020-01-01T12:00:00Z');`);
  const before = (await db.query('select payload,updated_at from public.void_records')).rows;
  await db.exec(await fs.readFile('supabase/migrations/20261026120158_game_journey_dates.sql', 'utf8'));
  assert.deepEqual((await db.query('select payload,updated_at from public.void_records')).rows, before);
  assert.deepEqual((await db.query('select started_at,finished_at from public.void_records')).rows, [{ started_at: null, finished_at: null }]);
  await db.exec(await fs.readFile('supabase/tests/game-journey.sql', 'utf8'));
  console.log('SQL: additive migration, date mirroring, legacy upserts, tombstones and owner RLS passed.');
} finally { await db.close(); }
