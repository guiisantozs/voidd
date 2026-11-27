begin;
create or replace function void_private.people_resolve(handle text) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid;normalized text:=lower(handle);
begin
 perform void_private.identity_limit('resolve');
 if not public.void_username_valid(normalized) or not void_private.name_allowed(normalized) then return null;end if;
 select user_id into uid from public.void_community_profiles where username=normalized;
 if uid is null then select user_id into uid from public.username_history where username=normalized and reserved_until>now() order by released_at desc limit 1;end if;
 return(select to_jsonb(t) from (select user_id,display_name,username,avatar_url from public.void_community_profiles where user_id=uid)t);
end;$$;
revoke all on function void_private.people_resolve(text) from public,anon,authenticated;
grant execute on function void_private.people_resolve(text) to anon,authenticated;
commit;
