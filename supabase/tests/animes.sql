-- Execute only on the isolated test database. No hosted fixture users.
begin;
create function pg_temp.anime_assert(ok boolean,message text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'ASSERT: %',message;end if;end;$$;
insert into auth.users(id) values('81000000-0000-4000-8000-000000000001'),('81000000-0000-4000-8000-000000000002');
insert into public.void_community_profiles(user_id,username,display_name,visibility) select id,'anime_'||right(id::text,4),'Anime fixture','public' from auth.users where id::text like '81000000%';
insert into public.void_series_units(series_id,season_number,episode_number,name,air_date) values(9000000001,1,0,'TV · Production','2020-01-01'),(9000000001,1,1,'Episode 1','2020-01-01'),(1,1,1,'Legacy TV','2020-01-01');
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
set local role authenticated;
insert into public.void_records(user_id,kind,item_key,payload) values
 (auth.uid(),'anime_watchlist','9000000001','{"item":{"id":9000000001,"categoria":"animes","titulo":"Anime","provider":"jikan","providerId":1}}'),
 (auth.uid(),'series_watchlist','9000000001','{"item":{"id":9000000001,"categoria":"series","titulo":"TV"}}'),
 (auth.uid(),'review','animes:9000000001','{"item":{"id":9000000001,"categoria":"animes","titulo":"Anime"},"nota":0,"ratingScale":5,"public":true}');
select set_config('test.anime_default',public.void_anime_watchlist_edit()::text,true);
select set_config('test.tv_default',public.void_series_watchlist_edit()::text,true);
select pg_temp.anime_assert(public.void_anime_watchlist_edit()::text=current_setting('test.anime_default'),'idempotent anime default');
select pg_temp.anime_assert(current_setting('test.anime_default')<>current_setting('test.tv_default'),'separate defaults');
select pg_temp.anime_assert(public.void_list_detail(current_setting('test.anime_default')::uuid)->'items'->0->>'media_type'='animes','anime identity');
select pg_temp.anime_assert(public.void_list_detail(current_setting('test.anime_default')::uuid)->>'visibility'='private','private default');
insert into public.void_anime_preferences(user_id,anime_ids) values(auth.uid(),array[9000000001,9000000002,9000000003]::bigint[]);
insert into public.void_series_unit_reviews(user_id,series_id,season_number,episode_number,rating,text,is_public,watched_on) values
 (auth.uid(),9000000001,1,0,4.2,'Part',false,'2020-01-01'),(auth.uid(),9000000001,1,1,0,'Episode',true,'2020-01-01');
insert into public.void_series_episode_progress(user_id,series_id,season_number,episode_number) values(auth.uid(),9000000001,1,1);
select pg_temp.anime_assert((select count(*)=2 from public.void_series_unit_reviews where series_id=9000000001),'independent unit notes');
select pg_temp.anime_assert((select (payload->>'nota')::numeric=0 from public.void_records where item_key='animes:9000000001'),'general rating untouched');
select pg_temp.anime_assert(jsonb_array_length(public.void_series_unit_summary(1))=0,'no legacy ID collision');
do $$begin
 begin insert into public.void_records(user_id,kind,item_key,payload) values(auth.uid(),'anime_watchlist','2','{"item":{"id":2,"categoria":"series","titulo":"Wrong"}}');raise exception 'wrong media accepted';exception when check_violation then null;end;
 begin insert into public.void_anime_preferences(user_id,anime_ids) values('81000000-0000-4000-8000-000000000002',array[9000000001,9000000002,9000000003]::bigint[]);raise exception 'other preferences accepted';exception when insufficient_privilege then null;end;
 begin update public.void_anime_preferences set anime_ids=array[1,2,3]::bigint[] where user_id=auth.uid();raise exception 'legacy preferences accepted';exception when check_violation then null;end;
 begin delete from public.lists where id=current_setting('test.anime_default')::uuid;raise exception 'standard deleted';exception when raise_exception then if sqlerrm<>'STANDARD_LIST' then raise;end if;end;
end;$$;
select set_config('test.anime_shared',public.void_list_write_v3(null,'{"title":"Anime group","visibility":"private","ranked":false,"media_types":["animes"],"collaboration_enabled":true}',null,null)::text,true);
select public.void_list_item_toggle(current_setting('test.anime_shared')::uuid,'{"media_type":"animes","external_id":"9000000001","snapshot":{"id":9000000001,"categoria":"animes","titulo":"Anime"}}',true);
select public.void_list_invitation(current_setting('test.anime_shared')::uuid,'81000000-0000-4000-8000-000000000002','invite');
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000002',true);
select pg_temp.anime_assert(not exists(select 1 from public.void_anime_preferences),'preferences private');
select pg_temp.anime_assert(not exists(select 1 from public.void_series_episode_progress),'watched progress private');
select pg_temp.anime_assert((select count(*)=1 from public.void_series_unit_reviews where series_id=9000000001),'only public unit notes');
select pg_temp.anime_assert(public.void_list_detail(current_setting('test.anime_shared')::uuid) is null,'pending member denied');
select public.void_list_invitation(current_setting('test.anime_shared')::uuid,auth.uid(),'accept');
select public.void_list_complete(current_setting('test.anime_shared')::uuid,'animes','9000000001',true);
select pg_temp.anime_assert((select count(*)=1 from public.list_progress where list_id=current_setting('test.anime_shared')::uuid),'anime collaboration progress');
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.anime_assert(public.void_list_detail(current_setting('test.anime_default')::uuid) is null,'anonymous default denied');
select pg_temp.anime_assert((public.void_series_unit_summary(9000000001)->0->>'average')::numeric=0,'public zero score');
reset role;
update public.void_community_profiles set visibility='private' where user_id='81000000-0000-4000-8000-000000000001';
set local role anon;
select pg_temp.anime_assert(jsonb_array_length(public.void_series_unit_summary(9000000001))=0,'profile privacy protects public units');
reset role;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
set local role authenticated;
update public.void_records set payload=null where user_id=auth.uid() and kind='anime_watchlist' and item_key='9000000001';
select pg_temp.anime_assert(jsonb_array_length(public.void_list_detail(current_setting('test.anime_default')::uuid)->'items')=0,'anime tombstone');
select pg_temp.anime_assert(jsonb_array_length(public.void_list_detail(current_setting('test.tv_default')::uuid)->'items')=1,'anime removal preserves TV');
rollback;
