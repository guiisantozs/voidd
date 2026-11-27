-- Rollback-only: no account or preference fixture survives this test.
begin;
create temp table taste_test_users as select gen_random_uuid() a,gen_random_uuid() b;
grant select on taste_test_users to anon,authenticated;
insert into auth.users(id) select a from taste_test_users union all select b from taste_test_users;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select a::text from taste_test_users),true);
insert into public.void_series_preferences(user_id,series_ids) values(auth.uid(),array[1,2,3]::bigint[]);
-- Same upsert shape as PostgREST. No permission to update completion timestamps.
insert into public.void_series_preferences(user_id,series_ids) values(auth.uid(),array[4,5,6]::bigint[]) on conflict(user_id) do update set user_id=excluded.user_id,series_ids=excluded.series_ids;
do $$begin
 if (select series_ids from public.void_series_preferences where user_id=auth.uid())<>array[4,5,6]::bigint[] then raise exception 'Own upsert failed';end if;
 begin update public.void_series_preferences set series_ids=array[1,1,2]::bigint[] where user_id=auth.uid();raise exception 'Duplicate accepted';exception when check_violation then null;end;
 begin update public.void_series_preferences set series_ids=array[1,2]::bigint[] where user_id=auth.uid();raise exception 'Incomplete accepted';exception when check_violation then null;end;
 begin update public.void_series_preferences set series_ids=array[1,null,2]::bigint[] where user_id=auth.uid();raise exception 'Null accepted';exception when check_violation then null;end;
 begin update public.void_series_preferences set completed_at=now();raise exception 'Completion timestamp writable';exception when insufficient_privilege then null;end;
 begin update public.void_series_preferences set user_id=(select b from taste_test_users) where user_id=auth.uid();raise exception 'Owner reassignment accepted';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub',(select b::text from taste_test_users),true);
do $$begin
 if exists(select 1 from public.void_series_preferences) then raise exception 'Other account preferences leaked';end if;
 update public.void_series_preferences set series_ids=array[7,8,9]::bigint[] where user_id=(select a from taste_test_users);
 if found then raise exception 'Other account updated';end if;
 delete from public.void_series_preferences where user_id=(select a from taste_test_users);
 if found then raise exception 'Other account deleted';end if;
 begin insert into public.void_series_preferences(user_id,series_ids) select a,array[7,8,9]::bigint[] from taste_test_users;raise exception 'Forged owner inserted';exception when insufficient_privilege then null;end;
end$$;
insert into public.void_series_preferences(user_id,series_ids) values(auth.uid(),array[7,8,9]::bigint[]);
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$begin
 begin perform * from public.void_series_preferences;raise exception 'Anonymous read accepted';exception when insufficient_privilege then null;end;
end$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select a::text from taste_test_users),true);
do $$begin
 if (select series_ids from public.void_series_preferences where user_id=auth.uid())<>array[4,5,6]::bigint[] then raise exception 'Choices lost between sessions';end if;
end$$;
delete from public.void_series_preferences where user_id=auth.uid();
do $$begin if exists(select 1 from public.void_series_preferences) then raise exception 'Own deletion failed';end if;end$$;
reset role;
rollback;
