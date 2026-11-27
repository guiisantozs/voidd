-- Rollback-only integration test. Never persists accounts, ratings, progress or catalogue fixtures.
begin;
create temp table series_test_users as select gen_random_uuid() a,gen_random_uuid() b,gen_random_uuid() c;
grant select on series_test_users to anon,authenticated;
insert into auth.users(id) select a from series_test_users union all select b from series_test_users union all select c from series_test_users;
insert into public.void_community_profiles(user_id,display_name,username) select a,'Teste A','s_'||substr(md5(a::text),1,12) from series_test_users union all select b,'Teste B','s_'||substr(md5(b::text),1,12) from series_test_users union all select c,'Teste C','s_'||substr(md5(c::text),1,12) from series_test_users on conflict(user_id) do update set username=excluded.username;
insert into public.void_series_units(series_id,season_number,episode_number,name,air_date) values(9999999998,1,0,'Temporada teste','2020-01-01'),(9999999998,1,1,'Episódio teste','2020-01-01'),(9999999998,1,2,'Episódio futuro',(now() at time zone 'America/Sao_Paulo')::date+1),(9999999998,1,3,'Sem data',null);
set local role authenticated;
select set_config('request.jwt.claim.sub',(select a::text from series_test_users),true);
insert into public.void_series_unit_reviews(user_id,series_id,season_number,episode_number,rating,text,is_public,watched_on) values(auth.uid(),9999999998,1,1,0,'Zero é válido',true,'2020-01-01');
insert into public.void_series_episode_progress(user_id,series_id,season_number,episode_number) values(auth.uid(),9999999998,1,1);
do $$begin
 begin insert into public.void_series_units values(9999999998,2,0,'Forjado','2020-01-01',now());raise exception 'Browser registered provider facts';exception when insufficient_privilege then null;end;
 begin insert into public.void_series_unit_reviews(user_id,series_id,season_number,episode_number,rating,watched_on) values(auth.uid(),9999999998,1,1,5,'2020-01-01');raise exception 'Duplicate review accepted';exception when unique_violation then null;end;
 begin insert into public.void_series_unit_reviews(user_id,series_id,season_number,episode_number,rating,watched_on) select b,9999999998,1,1,4,'2020-01-01' from series_test_users;raise exception 'Forged owner accepted';exception when insufficient_privilege then null;end;
 begin insert into public.void_series_unit_reviews(user_id,series_id,season_number,episode_number,rating,watched_on) values(auth.uid(),9999999998,1,2,4,(now() at time zone 'America/Sao_Paulo')::date);raise exception 'Future episode accepted';exception when insufficient_privilege then null;end;
 begin insert into public.void_series_episode_progress(user_id,series_id,season_number,episode_number) values(auth.uid(),9999999998,1,2);raise exception 'Future watch accepted';exception when insufficient_privilege then null;end;
 begin insert into public.void_series_unit_reviews(user_id,series_id,season_number,episode_number,rating,watched_on) values(auth.uid(),9999999998,1,3,4,'2020-01-01');raise exception 'Unknown date accepted';exception when insufficient_privilege then null;end;
 update public.void_series_unit_reviews set rating=4.2,text='Editada' where user_id=auth.uid() and series_id=9999999998;
 if (select rating from public.void_series_unit_reviews where user_id=auth.uid() and series_id=9999999998)<>4.2 then raise exception 'Edit failed';end if;
end$$;
select set_config('request.jwt.claim.sub',(select b::text from series_test_users),true);
insert into public.void_series_unit_reviews(user_id,series_id,season_number,episode_number,rating,is_public,watched_on) values(auth.uid(),9999999998,1,1,5,false,'2020-01-01');
do $$begin
 if exists(select 1 from public.void_series_episode_progress where series_id=9999999998) then raise exception 'Private progress leaked';end if;
 if (public.void_series_unit_summary(9999999998)->0->>'total')::integer<>1 then raise exception 'Own private rating contaminated summary';end if;
 if (public.void_series_unit_summary(9999999998)->0->>'average')::numeric<>4.2 then raise exception 'Wrong public average';end if;
end$$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$begin
 if (select count(*) from public.void_series_unit_reviews where series_id=9999999998)<>1 then raise exception 'Anonymous private leak';end if;
 begin perform * from public.void_series_episode_progress;raise exception 'Anonymous progress readable';exception when insufficient_privilege then null;end;
end$$;
reset role;
update public.void_community_profiles set visibility='private' where user_id=(select a from series_test_users);
set local role anon;
do $$begin if jsonb_array_length(public.void_series_unit_summary(9999999998))<>0 then raise exception 'Private profile leaked through aggregate';end if;end$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select a::text from series_test_users),true);
delete from public.void_series_unit_reviews where user_id=auth.uid() and series_id=9999999998;
delete from public.void_series_episode_progress where user_id=auth.uid() and series_id=9999999998;
do $$begin if exists(select 1 from public.void_series_unit_reviews where user_id=auth.uid() and series_id=9999999998) then raise exception 'Delete failed';end if;end$$;
reset role;
rollback;
