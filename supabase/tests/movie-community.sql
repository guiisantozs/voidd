-- Execute against a development project. All fixtures are rolled back.
begin;
insert into auth.users(id) select ('99999999-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,6)n;
insert into public.void_community_profiles(user_id,display_name) select ('99999999-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Teste público '||n from generate_series(1,6)n on conflict(user_id) do update set display_name=excluded.display_name,visibility=excluded.visibility;
update public.void_community_profiles set username='test_'||substr(md5(user_id::text),1,12) where user_id::text like '99999999-0000-4000-8000-%';
insert into public.void_records(user_id,kind,item_key,payload)
select ('99999999-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'review','filmes:900000001',
jsonb_build_object('item',jsonb_build_object('id',900000001,'categoria','filmes','titulo','RLS fixture','genreIds',jsonb_build_array(18)),
'nota',case when n%2=0 then 5 else 0.5 end,'public',n<=5,'texto','Texto fixture') from generate_series(1,6)n;
insert into public.void_records(user_id,kind,item_key,payload)
select '99999999-0000-4000-8000-000000000006','review','filmes:'||n,
jsonb_build_object('item',jsonb_build_object('id',n,'categoria','filmes','titulo','Private','genreIds',jsonb_build_array(18)),'nota',5)
from generate_series(900000002,900000003)n;
insert into public.void_friendships(sender,recipient,status) values
('99999999-0000-4000-8000-000000000001','99999999-0000-4000-8000-000000000006','accepted');
set local role anon;
do $$ begin
if (select count(*) from public.void_records where item_key='filmes:900000001')<>5 then raise exception 'Anonymous privacy failed';end if;
if (select total from public.void_movie_stats where item_key='filmes:900000001')<>5 then raise exception 'Aggregate privacy failed';end if;
if not exists(select 1 from jsonb_array_elements(public.void_movie_feed('divided')) r where r->'movie'->>'id'='900000001') then raise exception 'Divisive ranking failed';end if;
begin perform public.void_movie_preferences();raise exception 'Anonymous preferences allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','99999999-0000-4000-8000-000000000006',true);
set local role authenticated;
do $$ declare prefs jsonb; friends jsonb; begin
prefs:=public.void_movie_preferences();friends:=public.void_friend_movies();
if (prefs->>'count')::int<>3 or prefs->'genres'<>'["18"]'::jsonb then raise exception 'Preferences ownership failed';end if;
if (friends->>'friendCount')::int<>1 or jsonb_array_length(friends->'movies')<>1 then raise exception 'Friends failed';end if;
if (select total from public.void_movie_stats where item_key='filmes:900000001')<>5 then raise exception 'Own private leaked to aggregate';end if;
update public.void_records set payload=null where user_id='99999999-0000-4000-8000-000000000001' and item_key='filmes:900000001';
if found then raise exception 'Cross-user update allowed';end if;
begin update public.void_friendships set sender='99999999-0000-4000-8000-000000000002';raise exception 'Friend reassignment allowed';exception when insufficient_privilege then null;end;
begin update public.void_records set created_at=now();raise exception 'Timestamp rewriting allowed';exception when insufficient_privilege then null;end;
insert into public.void_records(user_id,kind,item_key,payload) values
('99999999-0000-4000-8000-000000000006','watchlist','900000001','{"item":{"id":900000001,"categoria":"filmes","titulo":"Watchlist"}}')
on conflict(user_id,kind,item_key) do update set payload=excluded.payload;
update public.void_records set payload=null where user_id=(select auth.uid()) and kind='watchlist' and item_key='900000001';
if not found then raise exception 'Own watchlist removal failed';end if;
end $$;
reset role;
rollback;
