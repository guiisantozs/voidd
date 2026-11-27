-- Requested one-time publication of existing gamer collections. Later owner
-- choices stay private; community profile visibility continues to apply.
alter table public.void_collection_preferences alter column visibility set default 'public';
update public.void_collection_preferences set visibility='public' where visibility='private';

create or replace function void_private.can_view_collection(target uuid) returns boolean
 language sql stable security definer set search_path='' as $$
 select target=auth.uid() or (
  coalesce((select visibility='public' from public.void_collection_preferences where user_id=target),true)
  and coalesce(void_private.can_view_profile(target),false)
 );
$$;
revoke all on function void_private.can_view_collection(uuid) from public;
grant execute on function void_private.can_view_collection(uuid) to anon,authenticated,service_role;

-- A positive unlocked achievement is valid evidence even when Steam no longer
-- lists a licence as owned. Unknown playtime and last-played dates stay NULL.
alter table public.void_game_activity drop constraint void_game_activity_evidence_check;
alter table public.void_game_activity add constraint void_game_activity_evidence_check
 check(evidence in ('playtime','last_played','achievement'));
alter table public.void_game_activity drop constraint void_game_activity_check;
alter table public.void_game_activity add constraint void_game_activity_check check(
 coalesce(playtime_minutes,0)>0 or last_played_at is not null
 or (evidence='achievement' and coalesce(achievement_unlocked,0)>0)
);

-- Missing hours in a shared-game response must not erase previously known hours.
create or replace function public.void_collection_commit(p_user uuid,p_run uuid,p_lease uuid,p_games jsonb,p_count integer) returns jsonb
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
   on conflict(user_id,provider,external_id) do update set playtime_minutes=coalesce(excluded.playtime_minutes,public.void_game_activity.playtime_minutes),last_played_at=coalesce(excluded.last_played_at,public.void_game_activity.last_played_at),synced_at=now(),
    achievements=coalesce(excluded.achievements,public.void_game_activity.achievements),
    achievement_total=coalesce(excluded.achievement_total,public.void_game_activity.achievement_total),
    achievement_unlocked=coalesce(excluded.achievement_unlocked,public.void_game_activity.achievement_unlocked),achievement_status=excluded.achievement_status;
 end loop;
 done:=r.position+p_count>=jsonb_array_length(r.plan);
 update public.void_game_sync_runs set position=position+p_count,imported=imported+added,warnings=warnings+partial,state=case when done then 'completed' else 'ready' end,
  lease=null,lease_until=null,finished_at=case when done then now() else null end where id=p_run returning * into r;
 return jsonb_build_object('id',r.id,'position',r.position,'total',jsonb_array_length(r.plan),'imported',r.imported,'warnings',r.warnings,'done',done,'finished_at',r.finished_at);
end;$$;
