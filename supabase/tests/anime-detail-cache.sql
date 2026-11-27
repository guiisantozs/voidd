-- Isolated development database only. Never run fixture users on the hosted project.
begin;
create function pg_temp.assert_anime(ok boolean,message text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'ASSERT: %',message;end if;end;$$;
select pg_temp.assert_anime(not has_table_privilege('anon','public.void_anime_cache','select'),'no anonymous cache access');
select pg_temp.assert_anime(not has_table_privilege('authenticated','public.void_anime_cache','insert'),'no browser cache poisoning');
select pg_temp.assert_anime(not has_function_privilege('anon','public.void_anime_api_slot(integer)','execute'),'rate limit is server only');
set local role service_role;
select pg_temp.assert_anime(public.void_anime_cache_claim('test:claim','83000000-0000-4000-8000-000000000001'),'first refresh lease');
select pg_temp.assert_anime(not public.void_anime_cache_claim('test:claim','83000000-0000-4000-8000-000000000002'),'second refresh denied');
select pg_temp.assert_anime(public.void_anime_api_slot()=0,'first provider start');
select pg_temp.assert_anime(public.void_anime_api_slot()>0,'rolling per-second limit');
update public.void_anime_api_state set starts=array_fill(clock_timestamp()-interval '10 seconds',array[60]) where provider='jikan';
select pg_temp.assert_anime(public.void_anime_api_slot()>45000,'rolling minute limit');
reset role;
insert into auth.users(id) values('83000000-0000-4000-8000-000000000001'),('83000000-0000-4000-8000-000000000002');
insert into public.void_community_profiles(user_id,username,display_name,visibility) values('83000000-0000-4000-8000-000000000001','anime_test_a','Fixture A','public'),('83000000-0000-4000-8000-000000000002','anime_test_b','Fixture B','public');
insert into public.void_series_units(series_id,season_number,episode_number,name,air_date) values(9000000999,1,0,'Fixture season','2020-01-01'),(9000000999,1,1,'Fixture episode','2020-01-01');
insert into public.void_series_unit_reviews(user_id,series_id,season_number,episode_number,rating,text,is_public,watched_on) values
 ('83000000-0000-4000-8000-000000000001',9000000999,1,0,0,'Zero',true,'2020-01-01'),
 ('83000000-0000-4000-8000-000000000002',9000000999,1,0,5,'Five',true,'2020-01-01'),
 ('83000000-0000-4000-8000-000000000001',9000000999,1,1,4.2,'Private episode',false,'2020-01-01');
insert into public.void_series_episode_progress(user_id,series_id,season_number,episode_number) values('83000000-0000-4000-8000-000000000001',9000000999,1,1);
set local role anon;
select pg_temp.assert_anime((public.void_anime_season_summary(array[9000000999]::bigint[])->0->>'average')::numeric=2.5,'public zero and five count correctly');
select pg_temp.assert_anime(public.void_anime_season_summary(array[9000000999]::bigint[])->0->'distribution'='{"0":1,"5":1}'::jsonb,'score histogram');
reset role;
update public.void_community_profiles set visibility='private' where user_id='83000000-0000-4000-8000-000000000002';
set local role anon;
select pg_temp.assert_anime((public.void_anime_season_summary(array[9000000999]::bigint[])->0->>'average')::numeric=0,'private profiles excluded');
reset role;
select set_config('request.jwt.claim.sub','83000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.assert_anime(public.void_anime_progress_summary(array[9000000999]::bigint[])='[]'::jsonb,'other account progress is private');
reset role;
select set_config('request.jwt.claim.sub','83000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.assert_anime((public.void_anime_progress_summary(array[9000000999]::bigint[])->0->>'watched')::integer=1,'owner progress is visible');
rollback;
