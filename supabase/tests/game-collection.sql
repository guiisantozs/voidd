-- Development only. All fixture users, catalogue data and progress are rolled back.
begin;
create temp table collection_ids as select gen_random_uuid() a,gen_random_uuid() b;
create temp table collection_run(value jsonb);
grant all on collection_run to service_role;
grant select on collection_ids to service_role,authenticated;
insert into auth.users select a from collection_ids union all select b from collection_ids;
insert into public.test_profile_privacy select a,'public' from collection_ids union all select b,'public' from collection_ids;
insert into public.void_collection_preferences(user_id,visibility) select a,'private' from collection_ids;
insert into public.void_records select a,'review','jogos:4200','{"nota":4.1}' from collection_ids;
insert into public.void_records select a,'library','4200','{"status":"paused"}' from collection_ids;
set local role service_role;
insert into public.void_steam_connections(user_id,steam_id) select a,'76561198000000101' from collection_ids;
do $$begin
 begin
  perform public.void_collection_claim((select a from collection_ids),'[]','76561198000000999',now());
  raise exception 'Plan from another connection accepted';
 exception when raise_exception then if sqlerrm<>'NOT_CONNECTED' then raise;end if;end;
end$$;
insert into collection_run select public.void_collection_claim(a,'[{"appid":"620","title":"Portal 2","minutes":60,"evidence":"playtime"}]',s.steam_id,s.connected_at)
 from collection_ids join public.void_steam_connections s on s.user_id=a;
do $$begin
 begin perform public.void_collection_claim((select a from collection_ids));raise exception 'Concurrent lease accepted';
 exception when raise_exception then if sqlerrm<>'SYNC_BUSY' then raise;end if;end;
 begin
  perform public.void_collection_commit((select b from collection_ids),(select (value->>'id')::uuid from collection_run),(select (value->>'lease')::uuid from collection_run),'[]',0);
  raise exception 'Other user committed';
 exception when raise_exception then if sqlerrm<>'INVALID_SYNC' then raise;end if;end;
end$$;
select public.void_collection_commit(a,(value->>'id')::uuid,(value->>'lease')::uuid,
 '[{"appid":"620","title":"Portal 2","rawg_id":4200,"cover_url":null,"app_type":"game","minutes":60,"last_played_at":null,"evidence":"playtime","definitions":[{"key":"TEST","title":"Fixture"}],"achievements":[{"key":"TEST","unlocked":true,"unlocked_at":null}],"achievement_total":1,"achievement_unlocked":1,"achievement_status":"available"}]',1)
 from collection_ids cross join collection_run;
do $$begin
 begin
  perform public.void_collection_commit((select a from collection_ids),(select (value->>'id')::uuid from collection_run),(select (value->>'lease')::uuid from collection_run),'[]',0);
  raise exception 'Batch replay accepted';
 exception when raise_exception then if sqlerrm<>'INVALID_SYNC' then raise;end if;end;
end$$;
-- An interrupted second run resumes without duplicates. Unknown achievements preserve prior progress.
update public.void_game_sync_runs set started_at=now()-interval '2 minutes';
truncate collection_run;
insert into collection_run select public.void_collection_claim(a,'[{"appid":"620"}]',s.steam_id,s.connected_at) from collection_ids join public.void_steam_connections s on s.user_id=a;
select public.void_collection_release(a,(value->>'id')::uuid,(value->>'lease')::uuid,'PROVIDER_UNAVAILABLE') from collection_ids cross join collection_run;
truncate collection_run;
insert into collection_run select public.void_collection_claim(a) from collection_ids;
select public.void_collection_commit(a,(value->>'id')::uuid,(value->>'lease')::uuid,
 '[{"appid":"620","title":"Portal 2","rawg_id":4200,"app_type":"game","minutes":90,"evidence":"playtime","definitions":null,"achievements":null,"achievement_total":null,"achievement_unlocked":null,"achievement_status":"unavailable"}]',1)
 from collection_ids cross join collection_run;
do $$begin
 if (select count(*) from public.void_game_activity)<>1 or (select count(*) from public.void_collection_games)<>1 then raise exception 'Duplicate activity/catalogue';end if;
 if (select achievement_unlocked from public.void_game_activity)<>1 then raise exception 'Failure erased achievements';end if;
end$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select b::text from collection_ids),true);
do $$begin
 if exists(select 1 from public.void_game_activity) then raise exception 'Private activity leaked';end if;
 begin insert into public.void_game_activity(user_id,provider,external_id,source_account,playtime_minutes,evidence) values(auth.uid(),'steam','620','forged',4,'playtime');raise exception 'Activity forged';exception when insufficient_privilege then null;end;
 begin perform public.void_collection_claim(auth.uid());raise exception 'Server RPC exposed';exception when insufficient_privilege then null;end;
 begin insert into public.void_collection_preferences(user_id,visibility) select a,'public' from collection_ids;raise exception 'Other privacy altered';exception when insufficient_privilege then null;end;
 begin perform public.void_collection_feature(1,'steam','620','TEST');raise exception 'Other user achievement featured';exception when insufficient_privilege then null;end;
 begin perform source_account from public.void_game_activity;raise exception 'Platform account identifier exposed';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub',(select a::text from collection_ids),true);
insert into public.void_collection_preferences(user_id,visibility) values(auth.uid(),'public') on conflict(user_id) do update set visibility=excluded.visibility;
select public.void_collection_feature(1,'steam','620','TEST');
select public.void_collection_feature(2,'steam','620','TEST');
do $$begin
 if (select count(*) from public.void_collection_highlights)<>1 or (select slot from public.void_collection_highlights)<>2 then raise exception 'Highlight duplication';end if;
 begin perform public.void_collection_feature(4,'steam','620','TEST');raise exception 'Fourth slot accepted';exception when insufficient_privilege then null;end;
 begin perform public.void_collection_feature(3,'steam','620','NOT_UNLOCKED');raise exception 'Locked achievement featured';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub',(select b::text from collection_ids),true);
do $$begin if (select count(*) from public.void_game_activity)<>1 then raise exception 'Public collection inaccessible';end if;end$$;
reset role;
update public.test_profile_privacy set visibility='private' where user_id=(select a from collection_ids);
set local role authenticated;
do $$begin if exists(select 1 from public.void_game_activity) then raise exception 'Private profile did not constrain public collection';end if;end$$;
reset role;
set local role anon;
do $$begin if exists(select 1 from public.void_game_activity) then raise exception 'Anonymous bypassed private profile';end if;end$$;
reset role;
set local role service_role;
update public.void_game_sync_runs set started_at=now()-interval '2 minutes';
truncate collection_run;
insert into collection_run select public.void_collection_claim(a,'[{"appid":"620"}]',s.steam_id,s.connected_at) from collection_ids join public.void_steam_connections s on s.user_id=a;
select public.void_steam_connection_action('disconnect',a) from collection_ids;
do $$begin
 if exists(select 1 from public.void_game_sync_runs where state in ('ready','running')) then raise exception 'Disconnect kept live sync';end if;
 if (select count(*) from public.void_game_activity)<>1 then raise exception 'Disconnect erased retained history';end if;
 begin perform public.void_collection_commit((select a from collection_ids),(select (value->>'id')::uuid from collection_run),(select (value->>'lease')::uuid from collection_run),'[]',0);raise exception 'Disconnected sync committed';exception when raise_exception then if sqlerrm<>'INVALID_SYNC' then raise;end if;end;
end$$;
select public.void_collection_forget(a) from collection_ids;
do $$begin if exists(select 1 from public.void_game_activity) or exists(select 1 from public.void_collection_highlights) then raise exception 'Forget failed';end if;end$$;
reset role;
do $$begin
 if not exists(select 1 from public.void_records where kind='review' and payload='{"nota":4.1}') then raise exception 'Review altered';end if;
 if not exists(select 1 from public.void_records where kind='library' and payload='{"status":"paused"}') then raise exception 'Manual status altered';end if;
end$$;
rollback;
