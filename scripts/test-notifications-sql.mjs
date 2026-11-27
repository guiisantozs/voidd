// Isolated PostgreSQL fixtures. No hosted data or environment files are read.
// node scripts/test-notifications-sql.mjs ./tmp/lists-db-check/node_modules/@electric-sql/pglite/dist/index.js
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(path.resolve(process.argv[2])).href);
const db = new PGlite();
try {
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema void_private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,void_private to authenticated,anon;
    create table public.void_community_profiles(user_id uuid primary key references auth.users on delete cascade,username text unique,display_name text,avatar_url text,visibility text default 'public');
    create table public.follows(follower_id uuid references auth.users on delete cascade,followed_id uuid references auth.users on delete cascade,created_at timestamptz default now(),primary key(follower_id,followed_id));
    create table public.void_friendships(sender uuid references auth.users on delete cascade,recipient uuid references auth.users on delete cascade,status text,created_at timestamptz default now(),primary key(sender,recipient));
    create table public.void_records(user_id uuid references auth.users on delete cascade,kind text,item_key text,payload jsonb,updated_at timestamptz default now(),is_public boolean generated always as(kind='review' and coalesce((payload->>'public')::boolean,false)) stored,primary key(user_id,kind,item_key));
    alter table public.void_records enable row level security;
    grant select on public.void_records to authenticated;
    create policy records_read on public.void_records for select using(user_id=auth.uid() or (is_public and void_private.notification_profile_access(user_id,auth.uid())));
  `.replace('create policy records_read on public.void_records for select using(user_id=auth.uid() or (is_public and void_private.notification_profile_access(user_id,auth.uid())));',''));
  const source = await fs.readFile('supabase/migrations/20261020185807_movie_detail_reviews.sql', 'utf8');
  await db.exec(source.slice(source.indexOf('create table public.void_review_likes'), source.indexOf('create table public.void_review_reports')));
  await db.exec('create publication supabase_realtime;');
  await db.exec(`insert into auth.users values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
    insert into public.void_community_profiles(user_id,username,display_name) select id,'seed_'||right(id::text,12),'Seed' from auth.users;
    insert into public.void_friendships(sender,recipient,status) values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','pending');`);
  if (process.argv[3]) {
    const setup = await fs.readFile(process.argv[3], 'utf8');
    await db.exec(setup);
    let protectedExisting = false;
    try { await db.exec(setup); }
    catch (error) { protectedExisting = error.message.includes('NOTIFICATIONS_ALREADY_PRESENT'); await db.exec('rollback;'); }
    if (!protectedExisting) throw new Error('Setup must reject reapplication without changing existing data');
  } else {
    await db.exec(await fs.readFile('supabase/migrations/20261022140000_notifications.sql', 'utf8'));
    await db.exec(await fs.readFile('supabase/migrations/20261022210000_notification_mentions.sql', 'utf8'));
  }
  await db.exec(`do $$begin
    if (select count(*) from public.notifications where type='friend_request')<>1 then raise exception 'Existing pending invitation not seeded';end if;
    if (select count(*) from public.void_friendships where status='pending')<>1 then raise exception 'Seeding changed friendship';end if;
    end$$;
    delete from auth.users;`);
  await db.exec(`create policy records_read on public.void_records for select using(user_id=auth.uid() or (is_public and void_private.notification_profile_access(user_id,auth.uid())));
    grant execute on function void_private.notification_profile_access(uuid,uuid) to authenticated;
    grant select on public.void_review_likes,public.void_review_comments to authenticated;`);
  await db.exec(await fs.readFile('supabase/tests/notifications.sql', 'utf8'));
  await db.exec('grant select on public.void_friendships to authenticated;');
  await db.exec(await fs.readFile('supabase/migrations/20261027113605_friend_game_review_notifications.sql','utf8'));
  await db.exec(await fs.readFile('supabase/tests/friend-game-review-notifications.sql','utf8'));
  console.log('Notificações SQL: geração, preferências, privacidade, isolamento/RLS, deduplicação, ações desfeitas, exclusão de conta e retenção passaram. Banco isolado descartado.');
} catch (error) { console.error(error.message, error.code || '', error.where || ''); process.exitCode = 1; }
finally { await db.close(); }
