// Optional, isolated Postgres test runner. No connection to hosted Supabase.
// npm install --prefix tmp/lists-db-check --no-save --package-lock=false @electric-sql/pglite@0.5.11
// node scripts/test-lists-sql.mjs ./tmp/lists-db-check/node_modules/@electric-sql/pglite/dist/index.js
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const modulePath=process.argv[2];
if(process.argv.includes('--animes')&&!process.argv.includes('--series-lists'))process.argv.push('--series-lists');
if(!modulePath)throw Error('Informe o caminho do módulo PGlite temporário. Veja o cabeçalho deste script.');
const {PGlite}=await import(pathToFileURL(path.resolve(modulePath)).href);
const db=new PGlite();
try{
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;create schema void_private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,void_private to anon,authenticated;
    create table public.void_community_profiles(user_id uuid primary key references auth.users on delete cascade,display_name text not null default 'Pessoa',username text,avatar_url text,visibility text not null default 'public');
    create table public.follows(follower_id uuid references auth.users on delete cascade,followed_id uuid references auth.users on delete cascade,created_at timestamptz default now(),primary key(follower_id,followed_id));
    create table public.void_friendships(sender uuid references auth.users on delete cascade,recipient uuid references auth.users on delete cascade,status text,created_at timestamptz default now(),primary key(sender,recipient));
    create table void_private.write_limits(user_id uuid references auth.users on delete cascade,action text,bucket timestamptz,n integer,primary key(user_id,action));
    alter table void_private.write_limits enable row level security;
    alter table public.void_community_profiles enable row level security;
    alter table public.follows enable row level security;alter table public.void_friendships enable row level security;
    grant select on public.void_community_profiles,public.follows to anon,authenticated;
    grant insert,delete on public.follows to authenticated;
    grant select,insert,update,delete on public.void_friendships to authenticated;
    grant insert,update on public.void_community_profiles to authenticated;
    create policy follows_read on public.follows for select using(true);
    create policy follows_insert on public.follows for insert with check(follower_id=auth.uid());
    create policy follows_delete on public.follows for delete using(follower_id=auth.uid());
    create policy friends_read on public.void_friendships for select using(auth.uid() in(sender,recipient));
  `);
  // Reuse the actual helper definitions, rather than mocking their decisions.
  const files=await fs.readdir('supabase/migrations');
  const sources=await Promise.all(files.filter(f=>f.endsWith('.sql')&&!f.endsWith('_custom_lists.sql')).sort().map(f=>fs.readFile(`supabase/migrations/${f}`,'utf8')));
  // The current participation guard also checks the authoritative name rules.
  await db.exec('create table public.void_profiles(user_id uuid primary key references auth.users on delete cascade,display_name text);');
  const safetySource=await fs.readFile('supabase/migrations/20261022122811_review_release_and_name_safety.sql','utf8');
  await db.exec(safetySource.slice(safetySource.indexOf('create table void_private.prohibited_names'),safetySource.indexOf('create table void_private.profile_name_flags')));
  for(const name of ['can_view_profile','void_profile_friend_ids','void_detail_friend_ids','require_username']){
    const pattern=new RegExp(`create(?: or replace)? function (?:public|void_private)\\.${name}\\([\\s\\S]*?\\$\\$;`,'i');
    const definitions=sources.map(s=>s.match(pattern)?.[0]).filter(Boolean);
    if(!definitions.length)throw Error(`Missing existing helper ${name}`);
    await db.exec(definitions.at(-1).replace(/^create function/i,'create or replace function'));
  }
  await db.exec(`create policy profile_read on public.void_community_profiles for select using(void_private.can_view_profile(user_id));create policy profile_update on public.void_community_profiles for update using(user_id=auth.uid()) with check(user_id=auth.uid());`);
  await db.exec(await fs.readFile('supabase/migrations/20261021175411_custom_lists.sql','utf8'));
  await db.exec(await fs.readFile('supabase/migrations/20261021181519_list_rate_limit_utc.sql','utf8'));
  await db.exec(`create table public.void_records(user_id uuid references auth.users on delete cascade,kind text,item_key text,payload jsonb,created_at timestamptz default now(),updated_at timestamptz default now(),is_public boolean generated always as(kind='review' and coalesce((payload->>'public')::boolean,false)) stored,primary key(user_id,kind,item_key));
    alter table public.void_records enable row level security;
    grant select,insert on public.void_records to anon,authenticated;
    create policy records_read on public.void_records for select using(user_id=auth.uid() or (is_public and void_private.can_view_profile(user_id)));
    create policy records_write on public.void_records for insert with check(user_id=auth.uid());`);
  const reviewSource=await fs.readFile('supabase/migrations/20261020185807_movie_detail_reviews.sql','utf8');
  await db.exec(reviewSource.slice(reviewSource.indexOf('create table public.void_review_likes'),reviewSource.indexOf('create table public.void_review_comments')));
  await db.exec('alter table public.void_review_likes enable row level security;grant select,insert,delete on public.void_review_likes to anon,authenticated;');
  for(const name of ['likes_public','likes_own_insert','likes_own_delete']) await db.exec(reviewSource.match(new RegExp(`create policy ${name}[^;]+;`))[0]);
  await db.exec(await fs.readFile('supabase/migrations/20261021185959_public_lists_review_reactions.sql','utf8'));
  await db.exec(await fs.readFile('supabase/migrations/20261021200407_list_media_categories.sql','utf8'));
  await db.exec(await fs.readFile('supabase/migrations/20261021201641_editable_watch_later.sql','utf8'));
  await db.exec('create table void_private.identity_limits(actor text,window_start timestamptz,total integer,primary key(actor,window_start));alter table void_private.identity_limits enable row level security;revoke all on void_private.identity_limits from public,anon,authenticated;');
  const identitySource=await fs.readFile('supabase/migrations/20261021114441_required_usernames.sql','utf8');
  await db.exec(identitySource.match(/create function void_private\.identity_limit\([\s\S]*?\$\$;/)[0]);
  await db.exec(await fs.readFile('supabase/migrations/20261021202944_review_share_budget.sql','utf8'));
  await db.exec(await fs.readFile('supabase/migrations/20261022111939_private_review_share_budget.sql','utf8'));
  await db.exec(await fs.readFile('supabase/tests/custom-lists.sql','utf8'));
  await db.exec(await fs.readFile('supabase/tests/community-reactions.sql','utf8'));
  await db.exec(await fs.readFile('supabase/tests/list-media.sql','utf8'));
  await db.exec(await fs.readFile('supabase/tests/watchlist-settings.sql','utf8'));
  await db.exec(await fs.readFile('supabase/tests/review-share.sql','utf8'));
  await db.exec(await fs.readFile('supabase/migrations/20261022182656_exclude_default_discovery.sql','utf8'));
  await db.exec(await fs.readFile('supabase/tests/list-discovery.sql','utf8'));
  if(process.argv.includes('--profile-content')){
    await db.exec(await fs.readFile('supabase/migrations/20261022175151_profile_content_tabs.sql','utf8'));
    await db.exec(await fs.readFile('supabase/tests/profile-content.sql','utf8'));
    console.log('SQL: diario, atividade, mural e destaques passaram.');
  }
  if(process.argv.includes('--collaboration')||process.argv.includes('--series-lists')){
    await db.exec(reviewSource.slice(reviewSource.indexOf('create table public.void_review_comments'),reviewSource.indexOf('create table public.void_review_reports')));
    await db.exec(await fs.readFile('supabase/migrations/20261022140000_notifications.sql','utf8'));
    await db.exec(`insert into auth.users values('90000000-0000-4000-8000-000000000001');
      insert into public.void_community_profiles(user_id,username,display_name) values('90000000-0000-4000-8000-000000000001','preservado','Preservado');
      select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',false);
      select set_config('test.before',public.void_list_write(null,'{"title":"Anterior","visibility":"private","ranked":false}',null,null)::text,false);
      select public.void_list_item_toggle(current_setting('test.before')::uuid,'{"media_type":"filmes","external_id":"7","snapshot":{"titulo":"Anterior"}}',true);
      select set_config('test.before_item',(select (to_jsonb(i))::text from public.list_items i where list_id=current_setting('test.before')::uuid),false);
      select set_config('test.before_version',(select updated_at::text from public.lists where id=current_setting('test.before')::uuid),false);
      select set_config('request.jwt.claim.sub','',false);`);
    await db.exec(await fs.readFile('supabase/migrations/20261023132148_collaborative_lists.sql','utf8'));
    await db.exec(await fs.readFile('supabase/migrations/20261023170748_collaborative_list_compatibility.sql','utf8'));
    await db.exec(`do $$begin
      if (select to_jsonb(i)-'added_by' from public.list_items i where list_id=current_setting('test.before')::uuid)<>current_setting('test.before_item')::jsonb then raise exception 'Migration changed existing item';end if;
      if (select updated_at::text from public.lists where id=current_setting('test.before')::uuid)<>current_setting('test.before_version') then raise exception 'Migration changed existing list version';end if;
      if (select added_by from public.list_items where list_id=current_setting('test.before')::uuid)<>'90000000-0000-4000-8000-000000000001'::uuid then raise exception 'Migration lost attribution';end if;
      end$$;
      delete from auth.users where id='90000000-0000-4000-8000-000000000001';`);
    await db.exec(await fs.readFile('supabase/tests/list-collaboration.sql','utf8'));
    // Re-run existing behavior against the upgraded schema, not only the baseline.
    for(const suite of ['custom-lists','list-media','watchlist-settings','list-discovery'])await db.exec(await fs.readFile(`supabase/tests/${suite}.sql`,'utf8'));
    console.log('SQL colaborativo: convites, notificações, privacidade, progresso, autoria e permissões passaram.');
  }
  if(process.argv.includes('--series-lists')){
    // The baseline fixtures predate record-shape constraints; install the actual
    // prerequisite names, then let the new migration replace their definitions.
    await db.exec(`alter table public.void_records add constraint void_records_kind_check check(kind in('review','library','watchlist'));
      alter table public.void_records add constraint valid_item_key check(true);
      alter table public.void_records add constraint payload_shape check(true);
      grant update on public.void_records to authenticated;
      create policy records_update on public.void_records for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());`);
    await db.exec(await fs.readFile('supabase/migrations/20261103180314_series_watchlist.sql','utf8'));
    await db.exec(await fs.readFile('supabase/tests/series-lists.sql','utf8'));
    for(const suite of ['custom-lists','list-media','list-collaboration'])await db.exec(await fs.readFile(`supabase/tests/${suite}.sql`,'utf8'));
    console.log('SQL séries: lista padrão, identidade por mídia, privacidade, tombstones, colaboração e regressões passaram.');
  }
  if(process.argv.includes('--animes')){
    const accounts=await fs.readFile('supabase/migrations/202610200001_accounts.sql','utf8');
    await db.exec(accounts.match(/create function public\.void_touch_updated_at\([\s\S]*?\$\$;/)[0]);
    await db.exec(reviewSource.match(/create function void_private\.review_write_limit\([\s\S]*?\$\$;/)[0]);
    await db.exec(reviewSource.slice(reviewSource.indexOf('create table public.void_review_reports'),reviewSource.indexOf('alter table public.void_review_likes enable')));
    await db.exec(await fs.readFile('supabase/migrations/20261030150505_series_details_reviews.sql','utf8'));
    await db.exec(await fs.readFile('supabase/migrations/20261104110703_anime_catalog.sql','utf8'));
    await db.exec(await fs.readFile('supabase/tests/animes.sql','utf8'));
    // Repeat the collaboration and media tests against the final schema.
    for(const suite of ['series-lists','custom-lists','list-media','list-collaboration'])await db.exec(await fs.readFile(`supabase/tests/${suite}.sql`,'utf8'));
    console.log('SQL animes: listas isoladas, colaboração, notas por unidade, progresso, preferências, RLS e regressões passaram.');
  }
  if(process.argv.includes('--social')){
    await db.exec('alter table public.void_community_profiles add column avatar_id uuid;');
    const profiles=await fs.readFile('supabase/migrations/20261020192337_user_profiles_follows.sql','utf8');
    await db.exec(profiles.slice(profiles.indexOf('create table public.profile_favorites'),profiles.indexOf('create index profile_review_recent')));
    await db.exec(await fs.readFile('supabase/migrations/20261027113605_friend_game_review_notifications.sql','utf8'));
    await db.exec(await fs.readFile('supabase/migrations/20261027131431_social_community_features.sql','utf8'));
    await db.exec(await fs.readFile('supabase/migrations/20261027132735_social_contact_concurrency.sql','utf8'));
    await db.exec(await fs.readFile('supabase/tests/social-community.sql','utf8'));
    await db.exec(await fs.readFile('supabase/tests/list-collaboration.sql','utf8'));
    console.log('Social SQL: links, revogação, remoção, bloqueios, destinatário nominal, recomendações, deduplicação, notificações, privacidade, sugestões e regressão colaborativa passaram.');
  }
  console.log('SQL de listas: três contas, RLS, limites, versões, snapshots e operações passaram. Banco temporário descartado.');
}catch(error){console.error(error.message,error.code||'',error.where||'');process.exitCode=1;}finally{await db.close();}
