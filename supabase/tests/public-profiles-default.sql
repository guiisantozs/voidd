-- Development only; all fixtures are rolled back.
begin;
create temp table public_profile_ids as select gen_random_uuid() email_id,gen_random_uuid() oauth_id;
grant select on public_profile_ids to authenticated;
insert into auth.users(id,raw_app_meta_data,raw_user_meta_data)
select email_id,'{"provider":"email"}'::jsonb,jsonb_build_object('username','qa_'||substr(md5(email_id::text),1,12)) from public_profile_ids
union all select oauth_id,'{"provider":"discord"}'::jsonb,'{"username":"IGNORED OAUTH HANDLE"}'::jsonb from public_profile_ids;
do $$begin
 if (select count(*) from public.void_community_profiles where user_id in(select email_id from public_profile_ids union all select oauth_id from public_profile_ids) and visibility='public')<>2 then raise exception 'Signup profile is not public by default';end if;
end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select email_id::text from public_profile_ids),true);
update public.void_community_profiles set visibility='private' where user_id=auth.uid();
do $$begin
 if not exists(select 1 from public.void_community_profiles where user_id=auth.uid() and visibility='private') then raise exception 'Owner cannot choose private';end if;
end$$;
update public.void_community_profiles set visibility='followers' where user_id=auth.uid();
do $$begin
 if not exists(select 1 from public.void_community_profiles where user_id=auth.uid() and visibility='followers') then raise exception 'Owner cannot choose followers';end if;
end$$;
reset role;
rollback;
