-- Development fixtures only. Appearance must follow both collection and profile visibility.
begin;
create temp table gamer_appearance_ids as select gen_random_uuid() a,gen_random_uuid() b;
grant select on gamer_appearance_ids to anon,authenticated,service_role;
insert into auth.users select a from gamer_appearance_ids union all select b from gamer_appearance_ids;
insert into public.test_profile_privacy select a,'public' from gamer_appearance_ids union all select b,'public' from gamer_appearance_ids;
set local role service_role;
insert into public.void_collection_preferences(user_id,visibility,gamer_banner,favorite_game)
 select a,'private','{"title":"Selected banner"}','{"title":"Favorite game"}' from gamer_appearance_ids;
reset role;
set local role anon;
do $$begin if exists(select 1 from public.void_collection_preferences) then raise exception 'Private appearance leaked to anonymous';end if;end$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select a::text from gamer_appearance_ids),true);
do $$begin
 if (select favorite_game->>'title' from public.void_collection_preferences where user_id=auth.uid())<>'Favorite game' then raise exception 'Owner appearance inaccessible';end if;
 begin update public.void_collection_preferences set gamer_banner='{"url":"forged"}' where user_id=auth.uid();raise exception 'Direct appearance write accepted';exception when insufficient_privilege then null;end;
 begin insert into public.void_collection_preferences(user_id,gamer_banner) select b,'{}' from gamer_appearance_ids;raise exception 'Direct appearance insert accepted';exception when insufficient_privilege then null;end;
end$$;
insert into public.void_collection_preferences(user_id,visibility) values(auth.uid(),'public') on conflict(user_id) do update set visibility=excluded.visibility;
do $$begin if (select gamer_banner->>'title' from public.void_collection_preferences where user_id=auth.uid())<>'Selected banner' then raise exception 'Privacy upsert erased appearance';end if;end$$;
select set_config('request.jwt.claim.sub',(select b::text from gamer_appearance_ids),true);
do $$begin
 if (select count(*) from public.void_collection_preferences)<>1 then raise exception 'Visible appearance inaccessible to another user';end if;
 update public.void_collection_preferences set visibility='private' where user_id=(select a from gamer_appearance_ids);
 if (select visibility from public.void_collection_preferences where user_id=(select a from gamer_appearance_ids))<>'public' then raise exception 'Other account modified privacy';end if;
end$$;
reset role;
set local role anon;
do $$begin if (select favorite_game->>'title' from public.void_collection_preferences) is distinct from 'Favorite game' then raise exception 'Public favorite inaccessible';end if;end$$;
reset role;
update public.test_profile_privacy set visibility='private' where user_id=(select a from gamer_appearance_ids);
set local role anon;
do $$begin if exists(select 1 from public.void_collection_preferences) then raise exception 'Private profile appearance leaked';end if;end$$;
reset role;
set local role authenticated;
do $$begin if exists(select 1 from public.void_collection_preferences) then raise exception 'Private profile appearance leaked to another account';end if;end$$;
reset role;
set local role service_role;
update public.void_collection_preferences set gamer_banner=null where user_id=(select a from gamer_appearance_ids);
do $$begin if (select gamer_banner from public.void_collection_preferences where user_id=(select a from gamer_appearance_ids)) is not null then raise exception 'Banner removal failed';end if;end$$;
reset role;
rollback;
