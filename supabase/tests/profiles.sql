-- All accounts and records in this integration test are rolled back.
begin;
create temp table profile_test_ids as select gen_random_uuid() a,gen_random_uuid() b,gen_random_uuid() c;
grant select on profile_test_ids to anon,authenticated;
insert into auth.users(id,created_at) select a,'2025-01-01'::timestamptz from profile_test_ids union all select b,'2025-02-01'::timestamptz from profile_test_ids union all select c,'2025-03-01'::timestamptz from profile_test_ids;
insert into public.void_community_profiles(user_id,display_name,visibility) select a,'Teste A','public' from profile_test_ids union all select b,'Teste B','followers' from profile_test_ids on conflict(user_id) do update set display_name=excluded.display_name,visibility=excluded.visibility;
update public.void_community_profiles set username='test_'||substr(md5(user_id::text),1,12) where user_id in(select a from profile_test_ids union all select b from profile_test_ids union all select c from profile_test_ids);
insert into public.void_records(user_id,kind,item_key,payload)
select a,'review','filmes:9999999998',jsonb_build_object('item',jsonb_build_object('id',9999999998,'categoria','filmes','titulo','Fixture filme','generos',jsonb_build_array('Drama')),'nota',4,'public',true) from profile_test_ids
union all select a,'review','jogos:9999999998',jsonb_build_object('item',jsonb_build_object('id',9999999998,'categoria','jogos','titulo','Fixture jogo','generos',jsonb_build_array('RPG')),'nota',5,'public',false) from profile_test_ids
union all select b,'review','filmes:9999999998',jsonb_build_object('item',jsonb_build_object('id',9999999998,'categoria','filmes','titulo','Fixture filme'),'nota',3,'public',true) from profile_test_ids;
insert into public.void_friendships(sender,recipient,status) select a,c,'accepted' from profile_test_ids;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select a::text from profile_test_ids),true);
do $$declare result jsonb;begin
 result:=public.void_profile_overview(auth.uid());
 if (result->'counts'->>'reviews')::int<>2 then raise exception 'Owner must see private records';end if;
 if jsonb_typeof(result->'media'->0)<>'object' then raise exception 'Media aggregate has wrong shape: %',result->'media';end if;
 if (result->'counts'->>'friends')::int<>1 then raise exception 'Existing friend missing';end if;
 if jsonb_array_length(result->'histogram')<>11 then raise exception 'Incomplete histogram';end if;
 if (result->'profile'->>'joined_at')::date<>'2025-01-01'::date then raise exception 'Wrong account join date';end if;
end$$;
-- The old name-only upsert used by the review form and invitations still works.
insert into public.void_community_profiles(user_id,display_name) select a,'Teste A atualizado' from profile_test_ids on conflict(user_id) do update set user_id=excluded.user_id,display_name=excluded.display_name;
select public.void_profile_set_favorites('filmes','[{"id":100,"categoria":"filmes","titulo":"Primeiro"},{"id":200,"categoria":"filmes","titulo":"Segundo"}]');
select public.void_profile_set_favorites('filmes','[{"id":200,"categoria":"filmes","titulo":"Segundo"},{"id":100,"categoria":"filmes","titulo":"Primeiro"}]');
do $$begin
 if (select external_id from public.profile_favorites where user_id=auth.uid() and media_type='filmes' and slot=1)<>200 then raise exception 'Reorder failed';end if;
 begin
  perform public.void_profile_set_favorites('filmes','[{"id":100,"categoria":"filmes","titulo":"A"},{"id":100,"categoria":"filmes","titulo":"B"}]');
  raise exception 'Duplicate favorites accepted';
 exception when unique_violation then null;end;
 if (select external_id from public.profile_favorites where user_id=auth.uid() and media_type='filmes' and slot=1)<>200 then raise exception 'Failed reorder was not atomic';end if;
 begin
  insert into public.profile_favorites(user_id,media_type,slot,external_id,item) select b,'filmes',1,100,'{"id":100,"categoria":"filmes","titulo":"Forged"}' from profile_test_ids;
  raise exception 'Favorite ownership bypassed';
 exception when insufficient_privilege then null;end;
end$$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$declare result jsonb;begin
 result:=public.void_profile_overview((select a from profile_test_ids));
 if (result->'counts'->>'reviews')::int<>1 then raise exception 'Private record leaked to visitor';end if;
 if jsonb_array_length(result->'favorites')<>2 then raise exception 'Public favorites missing';end if;
 if (result->'counts'->>'friends')::int<>0 then raise exception 'Private legacy friendship exposed';end if;
 if not (public.void_profile_overview((select b from profile_test_ids))->>'locked')::boolean then raise exception 'Followers-only profile exposed';end if;
 if (public.void_movie_review_summary('filmes:9999999998')->>'total')::int<>1 then raise exception 'Follower-only review leaked into public aggregate';end if;
end$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select a::text from profile_test_ids),true);
update public.void_community_profiles set visibility='followers' where user_id=auth.uid();
select set_config('request.jwt.claim.sub',(select b::text from profile_test_ids),true);
do $$begin
 if exists(select 1 from public.void_records where user_id=(select a from profile_test_ids)) then raise exception 'Direct table privacy failed';end if;
 if exists(select 1 from public.profile_favorites where user_id=(select a from profile_test_ids)) then raise exception 'Favorites privacy failed';end if;
end$$;
insert into public.follows(follower_id,followed_id) select b,a from profile_test_ids;
do $$begin
 if (public.void_profile_overview((select a from profile_test_ids))->'counts'->>'reviews')::int<>1 then raise exception 'Follower cannot see shared profile';end if;
 if (public.void_profile_reviews((select a from profile_test_ids))->>'total')::int<>1 then raise exception 'Follower private review leak';end if;
 begin insert into public.follows(follower_id,followed_id) select b,a from profile_test_ids;raise exception 'Duplicate follow accepted';exception when unique_violation then null;end;
 begin insert into public.follows(follower_id,followed_id) select b,b from profile_test_ids;raise exception 'Self follow accepted';exception when check_violation then null;end;
 begin insert into public.follows(follower_id,followed_id) select a,b from profile_test_ids;raise exception 'Forged follow accepted';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub',(select a::text from profile_test_ids),true);
insert into public.follows(follower_id,followed_id) select a,b from profile_test_ids;
do $$begin
 if not ((select b from profile_test_ids)=any(public.void_detail_friend_ids())) then raise exception 'Mutual follow missing from existing friend helper';end if;
 if (public.void_friend_movies()->>'friendCount')::int<>2 then raise exception 'Legacy and mutual friends not unified';end if;
 if (public.void_profile_overview(auth.uid())->'counts'->>'friends')::int<>2 then raise exception 'Profile friend count mismatch';end if;
end$$;
select set_config('request.jwt.claim.sub',(select b::text from profile_test_ids),true);
delete from public.follows where follower_id=(select a from profile_test_ids);
do $$begin if not exists(select 1 from public.follows where follower_id=(select a from profile_test_ids)) then raise exception 'Deleted another account follow';end if;end$$;
select set_config('request.jwt.claim.sub',(select a::text from profile_test_ids),true);
update public.void_community_profiles set visibility='private' where user_id=auth.uid();
select set_config('request.jwt.claim.sub',(select b::text from profile_test_ids),true);
do $$begin
 if not (public.void_profile_overview((select a from profile_test_ids))->>'locked')::boolean then raise exception 'Following bypassed private profile';end if;
 if exists(select 1 from public.void_community_profiles where user_id=(select a from profile_test_ids)) then raise exception 'Private identity leaked';end if;
 if (public.void_profile_reviews((select a from profile_test_ids))->>'total')::int<>0 then raise exception 'Review RPC leaked private profile';end if;
end$$;
delete from public.follows where follower_id=auth.uid();
select set_config('request.jwt.claim.sub',(select a::text from profile_test_ids),true);
do $$begin
 if (select b from profile_test_ids)=any(public.void_detail_friend_ids()) then raise exception 'Unfollow did not remove mutual friendship';end if;
 if not ((select c from profile_test_ids)=any(public.void_detail_friend_ids())) then raise exception 'Unfollow removed legacy accepted friend';end if;
end$$;
select set_config('request.jwt.claim.sub',(select c::text from profile_test_ids),true);
select public.void_profile_set_favorites('jogos','[{"id":300,"categoria":"jogos","titulo":"Before setup"}]');
do $$begin if (public.void_profile_overview(auth.uid())->'profile'->>'visibility')<>'private' then raise exception 'New profile draft must be private';end if;end$$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$begin if exists(select 1 from public.profile_favorites where user_id=(select c from profile_test_ids)) then raise exception 'Unconfigured profile favorites leaked';end if;end$$;
reset role;
rollback;
