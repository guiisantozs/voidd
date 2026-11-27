// Isolated PostgreSQL only: no environment files or remote records.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(path.resolve(process.argv[2])).href);
const db = new PGlite();
try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema void_private;
 create table auth.users(id uuid primary key,created_at timestamptz default now(),raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,void_private to anon,authenticated,service_role;
 create table public.void_profiles(user_id uuid primary key references auth.users on delete cascade,display_name text not null,bio text default '',updated_at timestamptz default now());
 create table public.void_community_profiles(user_id uuid primary key references auth.users on delete cascade,display_name text not null,username text unique,username_changed_at timestamptz,joined_at timestamptz default now(),visibility text default 'public');
 create table public.username_history(user_id uuid references auth.users on delete cascade,username text,claimed_at timestamptz,released_at timestamptz default now(),reserved_until timestamptz default now()+interval '30 days');
 alter table public.username_history enable row level security;grant select on public.username_history to authenticated;create policy history_owner on public.username_history for select to authenticated using(user_id=auth.uid());
 create table void_private.identity_limits(actor text,window_start timestamptz,total integer,primary key(actor,window_start));
 create table public.void_records(user_id uuid references auth.users on delete cascade,kind text,item_key text,payload jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),is_public boolean generated always as(kind='review' and payload is not null and coalesce(payload->>'public','false')='true') stored,primary key(user_id,kind,item_key));
 alter table public.void_records enable row level security;alter table public.void_profiles enable row level security;alter table public.void_community_profiles enable row level security;
 grant select,insert,update,delete on public.void_records,public.void_profiles,public.void_community_profiles to authenticated;
 create policy records_own on public.void_records for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 create policy profile_own on public.void_profiles for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 create policy community_own on public.void_community_profiles for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 `);
 const usernames=await fs.readFile('supabase/migrations/20261021114441_required_usernames.sql','utf8');
 for(const name of ['void_username_valid','username_guard','identity_limit'])await db.exec(usernames.match(new RegExp(`create function (?:public|void_private)\\.${name}\\([\\s\\S]*?\\$\\$;`))[0]);
 await db.exec(`create trigger community_username_guard before insert or update on public.void_community_profiles for each row execute function void_private.username_guard();
 insert into auth.users(id) values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003');
 insert into public.void_community_profiles(user_id,username,display_name) values('00000000-0000-4000-8000-000000000001','ana_test','Ana'),('00000000-0000-4000-8000-000000000002','caralho','Bia'),('00000000-0000-4000-8000-000000000003','caio_test','CARALHO');
 insert into public.void_profiles(user_id,display_name) select user_id,display_name from public.void_community_profiles;`);
 await db.exec(await fs.readFile('supabase/migrations/20261022122811_review_release_and_name_safety.sql','utf8'));
  await db.exec(await fs.readFile('supabase/migrations/20261022123935_review_safety_private_policies.sql','utf8'));
 const signup=await fs.readFile('supabase/migrations/20261021134056_public_profiles_default.sql','utf8');
 await db.exec(signup.match(/create or replace function void_private\.username_signup\([\s\S]*?\$\$;/)[0]);
 await db.exec(`create trigger signup after insert on auth.users for each row execute function void_private.username_signup();
 create trigger records_username_required before insert or update on public.void_records for each row execute function void_private.require_username();`);
 await db.exec(await fs.readFile('supabase/tests/review-safety.sql','utf8'));
 await db.exec(`insert into auth.users(id,raw_user_meta_data) values('00000000-0000-4000-8000-000000000004','{"display_name":"Pessoa teste"}');update public.void_community_profiles set username='blockedhandletest' where user_id='00000000-0000-4000-8000-000000000004';`);
 await db.exec(await fs.readFile('supabase/migrations/20261022170000_moderated_handle_reset.sql','utf8'));
 // Synthetic moderation operation; never target a real account in public SQL.
 await db.exec(`insert into void_private.prohibited_names(term,reason) values('blocked handle test','fixture');
 insert into void_private.profile_name_flags(user_id,username_required,display_required,account_display_required,reason) values('00000000-0000-4000-8000-000000000004',true,false,false,'fixture');
 update public.void_community_profiles set username=null,visibility='private' where user_id='00000000-0000-4000-8000-000000000004';`);
 await db.exec(await fs.readFile('supabase/migrations/20261022170100_hide_moderated_handle_routes.sql','utf8'));
 await db.exec(await fs.readFile('supabase/tests/moderated-handle.sql','utf8'));
 console.log('SQL: estreia/forja/reabertura, RLS, nomes, cadastro direto, flags, correção/cooldown, arquivo reversível e estatísticas passaram.');
} catch(error) { console.error(error.message,error.code||'',error.where||'',error.position||'',error.query?.slice(Math.max(0,Number(error.position)-160),Number(error.position)+100)||'');process.exitCode=1; }
finally { await db.close(); }
