-- Integration checks: all accounts, history and rate counters roll back.
begin;
create temp table username_test_ids as select gen_random_uuid() a,gen_random_uuid() b,gen_random_uuid() c;
grant select on username_test_ids to anon,authenticated;
insert into auth.users(id) select a from username_test_ids union all select b from username_test_ids;
insert into auth.users(id,raw_user_meta_data) select c,jsonb_build_object('display_name','Mesmo nome','username','qc_'||substr(md5(c::text),1,12)) from username_test_ids;
do $$declare oauth_id uuid:=gen_random_uuid();begin
 insert into auth.users(id,raw_app_meta_data,raw_user_meta_data) values(oauth_id,'{"provider":"discord"}','{"username":"INVALID PROVIDER NAME"}');
 if exists(select 1 from public.void_community_profiles where user_id=oauth_id and username is not null) then raise exception 'Provider username was silently claimed';end if;
 begin insert into auth.users(id,raw_app_meta_data) values(gen_random_uuid(),'{"provider":"email"}');raise exception 'Email signup without username accepted';exception when raise_exception then if sqlerrm<>'USERNAME_REQUIRED' then raise;end if;end;
end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select a::text from username_test_ids),true);
do $$begin
 begin insert into public.follows(follower_id,followed_id) select a,b from username_test_ids;raise exception 'Pending identity followed someone';exception when insufficient_privilege then null;end;
 perform public.void_username_claim('qa_'||substr(md5(auth.uid()::text),1,12));
 begin perform public.void_username_claim('qa_other_name');raise exception 'Cooldown bypassed';exception when check_violation then if sqlerrm<>'USERNAME_COOLDOWN' then raise;end if;end;
 begin update public.void_community_profiles set username_changed_at=now()-interval '31 days' where user_id=auth.uid();raise exception 'Client rewrote timestamp';exception when insufficient_privilege then null;end;
end$$;
reset role;
-- Simulate the passage of 31 days for this fixture only; never alter real users.
set local session_replication_role=replica;
update public.void_community_profiles set username_changed_at=now()-interval '31 days' where user_id=(select a from username_test_ids);
set local session_replication_role=origin;
set local role authenticated;
select public.void_username_claim('qa_new_'||substr(md5(auth.uid()::text),1,10));
do $$begin
 if (select count(*) from public.username_history where user_id=auth.uid())<>1 then raise exception 'Missing history';end if;
 if not exists(select 1 from public.username_history where user_id=auth.uid() and reserved_until>now()+interval '29 days') then raise exception 'Missing reservation';end if;
end$$;
select set_config('request.jwt.claim.sub',(select b::text from username_test_ids),true);
do $$declare candidate text; result jsonb;begin
 select 'qa_'||substr(md5(a::text),1,12) into candidate from username_test_ids;
 if public.void_username_check(candidate)<>'taken' then raise exception 'Old handle not protected';end if;
 begin perform public.void_username_claim(candidate);raise exception 'Stolen reservation';exception when unique_violation then null;end;
 begin perform public.void_username_claim('admin');raise exception 'Reserved handle accepted';exception when check_violation then null;end;
 begin perform public.void_username_claim('Gui');raise exception 'Uppercase accepted';exception when check_violation then null;end;
 if exists(select 1 from public.username_history) then raise exception 'Other history leaked';end if;
 if exists(select 1 from public.void_community_profiles where user_id=(select a from username_test_ids)) then raise exception 'Private details leaked';end if;
 if (public.void_people_resolve(candidate)->>'user_id')<>(select a::text from username_test_ids) then raise exception 'Old route did not resolve';end if;
 result:=public.void_people_search('QA_NEW_');
 if not exists(select 1 from jsonb_array_elements(result)p where p->>'user_id'=(select a::text from username_test_ids)) then raise exception 'Private identity not discoverable';end if;
 if exists(select 1 from jsonb_array_elements(result)p where p?'email' or p?'bio' or p?'banner_url') then raise exception 'Search leaked private fields';end if;
 perform public.void_username_claim('qb_'||substr(md5(auth.uid()::text),1,12));
 begin perform public.void_username_claim('qc_'||substr(md5((select c from username_test_ids)::text),1,12));raise exception 'Duplicate name accepted';exception when unique_violation or check_violation then null;end;
end$$;
reset role;
do $$begin
 begin insert into auth.users(id,raw_user_meta_data) select gen_random_uuid(),jsonb_build_object('username','qc_'||substr(md5(c::text),1,12)) from username_test_ids;raise exception 'Signup duplicate accepted';exception when unique_violation then null;end;
end$$;
insert into void_private.identity_limits(actor,window_start,total) select 'people:'||b::text,date_trunc('minute',now()),40 from username_test_ids on conflict(actor,window_start) do update set total=40;
set local role authenticated;
do $$begin
 begin perform public.void_people_search('qa');raise exception 'Search limit bypassed';exception when raise_exception then if sqlerrm<>'RATE_LIMIT' then raise;end if;end;
end$$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$declare result jsonb;begin
 result:=public.void_people_search('qa_new_');
 if jsonb_array_length(result)>10 then raise exception 'Search returned too many rows';end if;
 if not exists(select 1 from public.void_identities(array[(select a from username_test_ids)])) then raise exception 'Anonymous identity unreadable';end if;
 if exists(select 1 from public.void_community_profiles where user_id=(select a from username_test_ids)) then raise exception 'Anonymous private profile leaked';end if;
end$$;
rollback;
