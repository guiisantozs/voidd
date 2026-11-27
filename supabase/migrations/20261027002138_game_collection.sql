-- Reuse the verified Steam connection; retain a compatible Steam-only view.
alter table public.void_steam_connections rename to void_platform_accounts;
alter table public.void_platform_accounts rename column steam_id to external_user_id;
alter table public.void_platform_accounts add column provider text not null default 'steam' check(provider in ('steam','playstation','xbox'));
alter table public.void_platform_accounts drop constraint void_steam_connections_pkey;
alter table public.void_platform_accounts drop constraint void_steam_connections_steam_id_key;
alter table public.void_platform_accounts drop constraint void_steam_connections_steam_id_check;
alter table public.void_platform_accounts add primary key(user_id,provider);
alter table public.void_platform_accounts add unique(provider,external_user_id);
alter table public.void_platform_accounts add check(provider<>'steam' or external_user_id ~ '^7656119[0-9]{10}$');
create view public.void_steam_connections with(security_invoker=true) as
 select user_id,external_user_id as steam_id,connected_at from public.void_platform_accounts where provider='steam' with local check option;
revoke all on public.void_steam_connections from public,anon,authenticated;
grant select on public.void_steam_connections to authenticated;
grant select,insert,update,delete on public.void_steam_connections to service_role;

create table public.void_collection_preferences(
 user_id uuid primary key references auth.users on delete cascade,
 visibility text not null default 'private' check(visibility in ('private','public'))
);
alter table public.void_collection_preferences enable row level security;
revoke all on public.void_collection_preferences from public,anon,authenticated;
grant select,insert,update on public.void_collection_preferences to authenticated;
grant all on public.void_collection_preferences to service_role;
create policy collection_preferences_owner on public.void_collection_preferences for all to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create function void_private.can_view_collection(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select target=auth.uid() or (exists(select 1 from public.void_collection_preferences where user_id=target and visibility='public') and coalesce(void_private.can_view_profile(target),false));
$$;
revoke all on function void_private.can_view_collection(uuid) from public;
grant execute on function void_private.can_view_collection(uuid) to anon,authenticated,service_role;

create table public.void_collection_games(
 id uuid primary key default gen_random_uuid(),rawg_id bigint unique check(rawg_id>0),title text not null,cover_url text,
 created_at timestamptz not null default now()
);
create table public.void_game_platform_ids(
 provider text not null check(provider in ('steam','playstation','xbox')),external_id text not null,
 game_id uuid not null references public.void_collection_games on delete cascade,
 app_type text not null default 'unknown',definitions jsonb,metadata_checked_at timestamptz,
 primary key(provider,external_id)
);
create index game_platform_canonical on public.void_game_platform_ids(game_id);
create table public.void_game_activity(
 user_id uuid not null references auth.users on delete cascade,provider text not null,external_id text not null,
 source_account text not null,playtime_minutes integer check(playtime_minutes>=0),last_played_at timestamptz,
 evidence text not null check(evidence in ('playtime','last_played')),
 achievements jsonb,achievement_total integer check(achievement_total>=0),achievement_unlocked integer check(achievement_unlocked>=0),
 achievement_status text not null default 'unknown' check(achievement_status in ('available','none','unavailable')),
 synced_at timestamptz not null default now(),primary key(user_id,provider,external_id),
 foreign key(provider,external_id) references public.void_game_platform_ids on delete cascade,
 check(coalesce(playtime_minutes,0)>0 or last_played_at is not null),
 check(achievement_unlocked is null or achievement_unlocked<=achievement_total)
);
create index game_activity_platform on public.void_game_activity(provider,external_id);
create table public.void_collection_highlights(
 user_id uuid not null references auth.users on delete cascade,slot smallint not null check(slot between 1 and 3),
 provider text not null,external_id text not null,achievement_key text not null,
 primary key(user_id,slot),unique(user_id,provider,external_id,achievement_key),
 foreign key(user_id,provider,external_id) references public.void_game_activity on delete cascade
);
create index collection_highlight_activity on public.void_collection_highlights(user_id,provider,external_id);
create table public.void_game_sync_runs(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,
 provider text not null default 'steam',source_account text not null,connection_at timestamptz not null,
 state text not null check(state in ('ready','running','completed','cancelled')),
 plan jsonb not null,position integer not null default 0,imported integer not null default 0,warnings integer not null default 0,
 lease uuid,lease_until timestamptz,last_error text,
 started_at timestamptz not null default now(),finished_at timestamptz
);
create index collection_sync_owner on public.void_game_sync_runs(user_id,provider,started_at desc);
create unique index collection_one_active_sync on public.void_game_sync_runs(user_id,provider) where state in ('ready','running');

alter table public.void_collection_games enable row level security;
alter table public.void_game_platform_ids enable row level security;
alter table public.void_game_activity enable row level security;
alter table public.void_collection_highlights enable row level security;
alter table public.void_game_sync_runs enable row level security;
revoke all on public.void_collection_games,public.void_game_platform_ids,public.void_game_activity,public.void_collection_highlights,public.void_game_sync_runs from public,anon,authenticated;
grant select on public.void_collection_games,public.void_game_platform_ids,public.void_game_activity,public.void_collection_highlights to anon,authenticated;
grant select on public.void_game_sync_runs to authenticated;
grant select,insert,update,delete on public.void_collection_games,public.void_game_platform_ids,public.void_game_activity,public.void_collection_highlights,public.void_game_sync_runs to service_role;
create policy collection_catalog_read on public.void_collection_games for select to anon,authenticated using(true);
create policy collection_ids_read on public.void_game_platform_ids for select to anon,authenticated using(true);
create policy collection_activity_read on public.void_game_activity for select to anon,authenticated using(void_private.can_view_collection(user_id));
create policy collection_highlights_read on public.void_collection_highlights for select to anon,authenticated using(void_private.can_view_collection(user_id));
create policy collection_sync_owner_read on public.void_game_sync_runs for select to authenticated using(user_id=(select auth.uid()));

-- A durable plan and short lease allow the browser to resume an interrupted import.
create function public.void_collection_claim(p_user uuid,p_plan jsonb default null,p_expected_account text default null,p_expected_connection timestamptz default null) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare account public.void_platform_accounts;r public.void_game_sync_runs;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,817));
 select * into account from public.void_platform_accounts where user_id=p_user and provider='steam';
 if not found then raise exception 'NOT_CONNECTED';end if;
 if exists(select 1 from public.void_game_activity where user_id=p_user and provider='steam' and source_account<>account.external_user_id) then raise exception 'SOURCE_CHANGED';end if;
 select * into r from public.void_game_sync_runs where user_id=p_user and provider='steam' and state in ('ready','running') for update;
 if found then
  if r.source_account<>account.external_user_id or r.connection_at<>account.connected_at then raise exception 'NOT_CONNECTED';end if;
  if r.lease_until>clock_timestamp() then raise exception 'SYNC_BUSY';end if;
 else
  if p_plan is null then return null;end if;
  if p_expected_account is distinct from account.external_user_id or p_expected_connection is distinct from account.connected_at then raise exception 'NOT_CONNECTED';end if;
  if jsonb_typeof(p_plan)<>'array' or jsonb_array_length(p_plan)>20000 then raise exception 'INVALID_PLAN';end if;
  if exists(select 1 from public.void_game_sync_runs where user_id=p_user and provider='steam' and started_at>now()-interval '60 seconds') or (select count(*) from public.void_game_sync_runs where user_id=p_user and started_at>now()-interval '24 hours')>=12 then raise exception 'SYNC_COOLDOWN';end if;
  insert into public.void_game_sync_runs(user_id,source_account,connection_at,state,plan)
   values(p_user,account.external_user_id,account.connected_at,'ready',p_plan) returning * into r;
 end if;
 update public.void_game_sync_runs set state='running',lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '55 seconds',last_error=null where id=r.id returning * into r;
 return to_jsonb(r);
end;$$;

create function public.void_collection_commit(p_user uuid,p_run uuid,p_lease uuid,p_games jsonb,p_count integer) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare r public.void_game_sync_runs;g jsonb;canonical uuid;old_game uuid;done boolean;added integer:=0;partial integer:=0;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,817));
 select * into r from public.void_game_sync_runs where id=p_run and user_id=p_user and state='running' and lease=p_lease and lease_until>clock_timestamp() for update;
 if not found then raise exception 'INVALID_SYNC';end if;
 if not exists(select 1 from public.void_platform_accounts where user_id=p_user and provider=r.provider and external_user_id=r.source_account and connected_at=r.connection_at) then raise exception 'NOT_CONNECTED';end if;
 if p_count<0 or p_count>5 or p_count>jsonb_array_length(r.plan)-r.position or jsonb_typeof(p_games)<>'array' then raise exception 'INVALID_BATCH';end if;
 for g in select value from jsonb_array_elements(p_games) loop
  if not exists(select 1 from jsonb_array_elements(r.plan) with ordinality e(value,n) where n>r.position and n<=r.position+p_count and e.value->>'appid'=g->>'appid') then raise exception 'INVALID_BATCH';end if;
  if coalesce((g->>'excluded')::boolean,false) then
   update public.void_game_platform_ids set app_type=g->>'app_type',metadata_checked_at=now() where provider=r.provider and external_id=g->>'appid';
   delete from public.void_game_activity where user_id=p_user and provider=r.provider and external_id=g->>'appid';
   continue;
  end if;
  added:=added+1;
  if g->>'achievement_status'='unavailable' or g->>'app_type'='unknown' then partial:=partial+1;end if;
  select game_id into old_game from public.void_game_platform_ids where provider=r.provider and external_id=g->>'appid';
  canonical:=old_game;
  if g->>'rawg_id' is not null then
   insert into public.void_collection_games(rawg_id,title,cover_url) values((g->>'rawg_id')::bigint,g->>'title',g->>'cover_url')
    on conflict(rawg_id) do update set title=excluded.title returning id into canonical;
  end if;
  if canonical is null then
   insert into public.void_collection_games(title,cover_url) values(g->>'title',g->>'cover_url') returning id into canonical;
  end if;
  insert into public.void_game_platform_ids(provider,external_id,game_id,app_type,definitions,metadata_checked_at)
   values(r.provider,g->>'appid',canonical,g->>'app_type',g->'definitions',now())
   on conflict(provider,external_id) do update set game_id=excluded.game_id,app_type=excluded.app_type,
    definitions=coalesce(nullif(excluded.definitions,'null'::jsonb),public.void_game_platform_ids.definitions),metadata_checked_at=now();
  insert into public.void_game_activity(user_id,provider,external_id,source_account,playtime_minutes,last_played_at,evidence,achievements,achievement_total,achievement_unlocked,achievement_status)
   values(p_user,r.provider,g->>'appid',r.source_account,(g->>'minutes')::integer,(g->>'last_played_at')::timestamptz,g->>'evidence',nullif(g->'achievements','null'::jsonb),(g->>'achievement_total')::integer,(g->>'achievement_unlocked')::integer,g->>'achievement_status')
   on conflict(user_id,provider,external_id) do update set playtime_minutes=excluded.playtime_minutes,last_played_at=coalesce(excluded.last_played_at,public.void_game_activity.last_played_at),synced_at=now(),
    achievements=coalesce(excluded.achievements,public.void_game_activity.achievements),
    achievement_total=coalesce(excluded.achievement_total,public.void_game_activity.achievement_total),
    achievement_unlocked=coalesce(excluded.achievement_unlocked,public.void_game_activity.achievement_unlocked),achievement_status=excluded.achievement_status;
 end loop;
 done:=r.position+p_count>=jsonb_array_length(r.plan);
 update public.void_game_sync_runs set position=position+p_count,imported=imported+added,warnings=warnings+partial,state=case when done then 'completed' else 'ready' end,
  lease=null,lease_until=null,finished_at=case when done then now() else null end where id=p_run returning * into r;
 return jsonb_build_object('id',r.id,'position',r.position,'total',jsonb_array_length(r.plan),'imported',r.imported,'warnings',r.warnings,'done',done,'finished_at',r.finished_at);
end;$$;

create function public.void_collection_release(p_user uuid,p_run uuid,p_lease uuid,p_error text) returns void
 language sql security invoker set search_path='' as $$
 update public.void_game_sync_runs set state='ready',lease=null,lease_until=null,last_error=left(p_error,50)
 where id=p_run and user_id=p_user and lease=p_lease and state='running';
$$;
revoke all on function public.void_collection_claim(uuid,jsonb,text,timestamptz),public.void_collection_commit(uuid,uuid,uuid,jsonb,integer),public.void_collection_release(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.void_collection_claim(uuid,jsonb,text,timestamptz),public.void_collection_commit(uuid,uuid,uuid,jsonb,integer),public.void_collection_release(uuid,uuid,uuid,text) to service_role;

create function void_private.collection_disconnect() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(old.user_id::text,817));
 update public.void_game_sync_runs set state='cancelled',lease=null,lease_until=null where user_id=old.user_id and provider=old.provider and state in ('ready','running');
 return old;
end;$$;
revoke all on function void_private.collection_disconnect() from public,anon,authenticated;
create trigger collection_disconnect after delete on public.void_platform_accounts for each row execute function void_private.collection_disconnect();

create function public.void_collection_forget(p_user uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,817));
 delete from public.void_game_sync_runs where user_id=p_user;
 delete from public.void_game_activity where user_id=p_user;
end;$$;
revoke all on function public.void_collection_forget(uuid) from public,anon,authenticated;
grant execute on function public.void_collection_forget(uuid) to service_role;

create function void_private.collection_feature(p_slot integer,p_provider text default null,p_external_id text default null,p_key text default null) returns void
 language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if actor is null or p_slot not between 1 and 3 then raise insufficient_privilege;end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,817));
 if p_key is not null and not exists(select 1 from public.void_game_activity a cross join lateral jsonb_array_elements(a.achievements) e where a.user_id=actor and a.provider=p_provider and a.external_id=p_external_id and e->>'key'=p_key and (e->>'unlocked')::boolean) then raise insufficient_privilege;end if;
 delete from public.void_collection_highlights where user_id=actor and (slot=p_slot or (provider=p_provider and external_id=p_external_id and achievement_key=p_key));
 if p_key is not null then insert into public.void_collection_highlights values(actor,p_slot,p_provider,p_external_id,p_key);end if;
end;$$;
revoke all on function void_private.collection_feature(integer,text,text,text) from public,anon;
grant execute on function void_private.collection_feature(integer,text,text,text) to authenticated;
create function public.void_collection_feature(p_slot integer,p_provider text default null,p_external_id text default null,p_key text default null) returns void language sql security invoker set search_path='' as $$select void_private.collection_feature(p_slot,p_provider,p_external_id,p_key);$$;
revoke all on function public.void_collection_feature(integer,text,text,text) from public,anon;
grant execute on function public.void_collection_feature(integer,text,text,text) to authenticated;

create function public.void_collection_access(target uuid) returns boolean language sql stable security invoker set search_path='' as $$select coalesce(void_private.can_view_collection(target),false);$$;
revoke all on function public.void_collection_access(uuid) from public;
grant execute on function public.void_collection_access(uuid) to anon,authenticated;

create function void_private.collection_connection_count(target uuid) returns bigint language sql stable security definer set search_path='' as $$
 select case when void_private.can_view_collection(target) then (select count(*) from public.void_platform_accounts where user_id=target) else null end;
$$;
revoke all on function void_private.collection_connection_count(uuid) from public;
grant execute on function void_private.collection_connection_count(uuid) to anon,authenticated;
create function public.void_collection_connection_count(target uuid) returns bigint language sql stable security invoker set search_path='' as $$select void_private.collection_connection_count(target);$$;
revoke all on function public.void_collection_connection_count(uuid) from public;
grant execute on function public.void_collection_connection_count(uuid) to anon,authenticated;
