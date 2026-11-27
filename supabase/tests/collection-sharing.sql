-- Isolated fixtures only; never run against live users.
begin;
create temp table sharing_ids as select gen_random_uuid() a,gen_random_uuid() b;
grant select on sharing_ids to anon,authenticated,service_role;
insert into auth.users select a from sharing_ids union all select b from sharing_ids;
insert into public.test_profile_privacy select a,'public' from sharing_ids union all select b,'public' from sharing_ids;

set local role anon;
do $$begin
 if not public.void_collection_access((select a from sharing_ids)) then raise exception 'Missing preferences did not default public';end if;
end$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select a::text from sharing_ids),true);
insert into public.void_collection_preferences(user_id) values(auth.uid());
do $$begin
 if (select visibility from public.void_collection_preferences where user_id=auth.uid())<>'public' then raise exception 'Inserted default not public';end if;
end$$;
update public.void_collection_preferences set visibility='private' where user_id=auth.uid();
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$begin
 if public.void_collection_access((select a from sharing_ids)) then raise exception 'Explicit private collection leaked';end if;
end$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select b::text from sharing_ids),true);
update public.void_collection_preferences set visibility='public' where user_id=(select a from sharing_ids);
do $$begin
 if public.void_collection_access((select a from sharing_ids)) then raise exception 'Other account changed privacy';end if;
end$$;
reset role;
update public.void_collection_preferences set visibility='public' where user_id=(select a from sharing_ids);
update public.test_profile_privacy set visibility='private' where user_id=(select a from sharing_ids);
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$begin
 if public.void_collection_access((select a from sharing_ids)) then raise exception 'Community profile privacy bypassed';end if;
end$$;
reset role;
update public.test_profile_privacy set visibility='public' where user_id=(select a from sharing_ids);

-- Importing a shared title must not require a licence or fabricated hours.
create temp table sharing_run(value jsonb);
grant all on sharing_run to service_role;
set local role service_role;
insert into public.void_steam_connections(user_id,steam_id) select a,'76561198000000102' from sharing_ids;
insert into sharing_run select public.void_collection_claim(a,'[{"appid":"367520","evidence":"achievement"}]',s.steam_id,s.connected_at)
 from sharing_ids join public.void_steam_connections s on s.user_id=a;
select public.void_collection_commit(a,(value->>'id')::uuid,(value->>'lease')::uuid,
 '[{"appid":"367520","title":"Hollow Knight","app_type":"game","minutes":null,"last_played_at":null,"evidence":"achievement","achievements":[{"key":"A","unlocked":true}],"achievement_total":2,"achievement_unlocked":1,"achievement_status":"available"}]',1)
 from sharing_ids cross join sharing_run;
do $$begin
 if not exists(select 1 from public.void_game_activity where user_id=(select a from sharing_ids) and external_id='367520' and playtime_minutes is null and last_played_at is null and achievement_unlocked=1) then raise exception 'Shared game missing';end if;
 begin
  update public.void_game_activity set achievement_unlocked=0 where user_id=(select a from sharing_ids);
  raise exception 'Unconfirmed activity accepted';
 exception when check_violation then null;end;
end$$;
-- A later lookup may confirm achievements without returning historical hours.
update public.void_game_activity set playtime_minutes=90 where user_id=(select a from sharing_ids);
update public.void_game_sync_runs set started_at=now()-interval '2 minutes' where user_id=(select a from sharing_ids);
truncate sharing_run;
insert into sharing_run select public.void_collection_claim(a,'[{"appid":"367520","evidence":"achievement"}]',s.steam_id,s.connected_at)
 from sharing_ids join public.void_steam_connections s on s.user_id=a;
select public.void_collection_commit(a,(value->>'id')::uuid,(value->>'lease')::uuid,
 '[{"appid":"367520","title":"Hollow Knight","app_type":"game","minutes":null,"last_played_at":null,"evidence":"achievement","achievement_total":2,"achievement_unlocked":1,"achievement_status":"available"}]',1)
 from sharing_ids cross join sharing_run;
do $$begin
 if (select playtime_minutes from public.void_game_activity where user_id=(select a from sharing_ids))<>90 then raise exception 'Missing Steam hours erased existing hours';end if;
end$$;
-- Owned and shared entries use one Steam AppID key. A repeated batch must not
-- duplicate either the card or cumulative hours in collection statistics.
update public.void_game_sync_runs set started_at=now()-interval '2 minutes' where user_id=(select a from sharing_ids);
truncate sharing_run;
insert into sharing_run select public.void_collection_claim(a,'[{"appid":"367520"},{"appid":"2552430"}]',s.steam_id,s.connected_at)
 from sharing_ids join public.void_steam_connections s on s.user_id=a;
select public.void_collection_commit(a,(value->>'id')::uuid,(value->>'lease')::uuid,
 '[{"appid":"367520","title":"Hollow Knight","app_type":"game","minutes":90,"evidence":"playtime","achievement_status":"unavailable"},{"appid":"2552430","title":"Kingdom Hearts","app_type":"game","minutes":57,"evidence":"playtime","achievement_status":"unavailable"}]',2)
 from sharing_ids cross join sharing_run;
update public.void_game_sync_runs set started_at=now()-interval '2 minutes' where user_id=(select a from sharing_ids);
truncate sharing_run;
insert into sharing_run select public.void_collection_claim(a,'[{"appid":"367520"},{"appid":"2552430"}]',s.steam_id,s.connected_at)
 from sharing_ids join public.void_steam_connections s on s.user_id=a;
select public.void_collection_commit(a,(value->>'id')::uuid,(value->>'lease')::uuid,
 '[{"appid":"367520","title":"Hollow Knight","app_type":"game","minutes":90,"evidence":"playtime","achievement_status":"unavailable"},{"appid":"2552430","title":"Kingdom Hearts","app_type":"game","minutes":57,"evidence":"playtime","achievement_status":"unavailable"}]',2)
 from sharing_ids cross join sharing_run;
do $$begin
 if (select count(*) from public.void_game_activity where user_id=(select a from sharing_ids))<>2 then raise exception 'Repeated family import duplicated games';end if;
 if (select sum(playtime_minutes) from public.void_game_activity where user_id=(select a from sharing_ids))<>147 then raise exception 'Repeated family import doubled hours';end if;
end$$;
-- A later import without these titles cannot remove their recorded activity.
update public.void_game_sync_runs set started_at=now()-interval '2 minutes' where user_id=(select a from sharing_ids);
truncate sharing_run;
insert into sharing_run select public.void_collection_claim(a,'[]',s.steam_id,s.connected_at)
 from sharing_ids join public.void_steam_connections s on s.user_id=a;
select public.void_collection_commit(a,(value->>'id')::uuid,(value->>'lease')::uuid,'[]',0) from sharing_ids cross join sharing_run;
do $$begin
 if not exists(select 1 from public.void_game_activity where user_id=(select a from sharing_ids) and external_id='367520') then raise exception 'Shared game disappeared';end if;
end$$;
reset role;
set local role anon;
do $$begin
 if (select count(*) from public.void_game_activity where user_id=(select a from sharing_ids))<>2 then raise exception 'Public shared history unavailable';end if;
 begin perform source_account from public.void_game_activity;raise exception 'Steam identity leaked';exception when insufficient_privilege then null;end;
end$$;
reset role;
rollback;
