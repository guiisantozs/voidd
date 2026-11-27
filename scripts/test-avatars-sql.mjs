// Isolated Postgres. No production accounts or Storage objects are written.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema void_private; create schema storage;
    create table auth.users(id uuid primary key,created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,void_private,storage to anon,authenticated,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(name text primary key,bucket_id text);
    alter table storage.objects enable row level security;
    grant all on storage.objects to authenticated,anon,service_role;
    create policy broad_legacy_allow on storage.objects for all to authenticated using(true) with check(true);
    create table public.void_community_profiles(user_id uuid primary key references auth.users(id),display_name text,username text,bio text,avatar_url text,visibility text);
    alter table public.void_community_profiles enable row level security;
    grant select on public.void_community_profiles to anon,authenticated;
    grant update(display_name,avatar_url) on public.void_community_profiles to authenticated;
    create policy profiles_read on public.void_community_profiles for select to anon,authenticated using(visibility='public' or user_id=(select auth.uid()));
    create policy own_identity_update on public.void_community_profiles for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
    insert into auth.users(id) values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
    insert into public.void_community_profiles values('11111111-1111-4111-8111-111111111111','A','aaa','private bio','https://example.invalid/upload.webp','public'),('22222222-2222-4222-8222-222222222222','B','bbb','secret bio','https://example.invalid/photo.webp','private');`);
  const before=(await db.query('select * from public.void_community_profiles order by user_id')).rows;
  await db.exec(await fs.readFile('supabase/migrations/20261026175618_character_avatars.sql','utf8'));
  const after=(await db.query('select * from public.void_community_profiles order by user_id')).rows;
  assert.deepEqual(after.map(({avatar_id,...row})=>row),before);
  assert.ok(after.every(row=>row.avatar_id===null));
  await db.exec(await fs.readFile('supabase/tests/avatars.sql','utf8'));
  console.log('SQL passed: additive schema, published catalog, owner writes, unpublished/invalid rejection, photo preservation, minimal identity, Storage restrictions and service role.');
} finally { await db.close(); }
