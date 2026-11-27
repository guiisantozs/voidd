import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema void_private;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,void_private to anon,authenticated,service_role;
 create table public.test_profile_privacy(user_id uuid primary key,visibility text);
 create function void_private.can_view_profile(target uuid) returns boolean language sql stable security definer as $$select exists(select 1 from public.test_profile_privacy where user_id=target and (visibility='public' or target=auth.uid()))$$;
 create table public.void_records(user_id uuid,kind text,item_key text,payload jsonb,primary key(user_id,kind,item_key));`);
 await db.exec(await fs.readFile('supabase/migrations/20261026235022_steam_connections.sql', 'utf8'));
 await db.exec(await fs.readFile('supabase/migrations/20261027002138_game_collection.sql', 'utf8'));
 await db.exec(await fs.readFile('supabase/migrations/20261027002717_collection_source_privacy.sql', 'utf8'));
 await db.exec(await fs.readFile('supabase/migrations/20261027013902_gamer_profile_appearance.sql', 'utf8'));
 await db.exec(await fs.readFile('supabase/migrations/20261027014223_gamer_appearance_owner_policies.sql', 'utf8'));
 // Pre-existing private collections are published once by the requested migration.
 await db.exec(`insert into auth.users values('00000000-0000-0000-0000-000000000099');
 insert into public.void_collection_preferences(user_id,visibility,gamer_banner) values('00000000-0000-0000-0000-000000000099','private','{"title":"Keep banner"}');`);
 await db.exec(await fs.readFile('supabase/migrations/20261029114352_public_gamer_profiles_and_shared_history.sql', 'utf8'));
 await db.exec(`do $$begin
 if not exists(select 1 from public.void_collection_preferences where user_id='00000000-0000-0000-0000-000000000099' and visibility='public' and gamer_banner->>'title'='Keep banner') then raise exception 'Legacy gamer publication failed';end if;
 end$$; delete from auth.users where id='00000000-0000-0000-0000-000000000099';`);
 await db.exec(await fs.readFile('supabase/tests/steam-connections.sql', 'utf8'));
 await db.exec(await fs.readFile('supabase/tests/game-collection.sql', 'utf8'));
 await db.exec(await fs.readFile('supabase/tests/gamer-profile-appearance.sql', 'utf8'));
 await db.exec(await fs.readFile('supabase/tests/collection-sharing.sql', 'utf8'));
 console.log('Collection SQL passed: Steam compatibility, owner isolation, privacy/profile visibility, leases, account binding, idempotence, achievements, disconnect, deletion and manual records preserved.');
} catch(error) {
 console.error('Collection SQL failed:',error.message,error.where||'');
 process.exitCode=1;
} finally { await db.close(); }
