begin;

-- Public-only, all-media lookup. Existing profile/record RLS remains authoritative.
create index void_friend_public_recent on public.void_records(user_id,updated_at desc,item_key desc)
 where kind='review' and is_public;

create function public.void_friend_activity(latest boolean default false,before_time timestamptz default null,before_user uuid default null,before_item text default null)
returns jsonb language sql stable security invoker set search_path='' as $$
 with friends as materialized(select unnest(public.void_detail_friend_ids()) id),
 candidates as (
  select r.*,p.display_name,p.username,p.avatar_url from friends f
  cross join lateral (
   select r.user_id,r.item_key,r.payload,r.updated_at from public.void_records r
   where r.user_id=f.id and r.kind='review' and r.is_public
    and (latest or before_time is null or (r.updated_at,r.user_id,r.item_key)<(before_time,before_user,before_item))
   order by r.updated_at desc,r.item_key desc limit case when latest then 1 else 9 end
  ) r join public.void_community_profiles p on p.user_id=r.user_id
  where (select auth.uid()) is not null
  order by r.updated_at desc,r.user_id desc,r.item_key desc limit case when latest then null else 9 end
 ), numbered as(select *,row_number() over(order by updated_at desc,user_id desc,item_key desc) rn from candidates),
 visible as(select * from numbered where latest or rn<=8)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object(
  'user_id',user_id,'item_key',item_key,'updated_at',updated_at,'display_name',display_name,'username',username,'avatar_url',avatar_url,
  'item',payload->'item','rating',(payload->>'nota')::numeric,'spoiler',coalesce((payload->>'spoiler')::boolean,false),
  'text',case when coalesce((payload->>'spoiler')::boolean,false) then null else left(payload->>'texto',180) end
 ) order by updated_at desc,user_id desc,item_key desc) from visible),'[]'::jsonb),
 'has_more',not latest and (select count(*)>8 from candidates),
 'cursor',case when latest then null else(select jsonb_build_object('time',updated_at,'user',user_id,'item',item_key) from visible order by rn desc limit 1) end);
$$;
revoke all on function public.void_friend_activity(boolean,timestamptz,uuid,text) from public,anon,authenticated;
grant execute on function public.void_friend_activity(boolean,timestamptz,uuid,text) to authenticated;

-- Atomic, per-account budgets also protect writes made outside this interface.
-- Reuse the existing private, RLS-denied counters; no new exposed table.
create function void_private.social_budget(scope text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();used integer;budget integer;
begin
 if actor is null then raise insufficient_privilege;end if;
 budget:=case scope when 'social_follow' then 60 when 'social_invite' then 20 when 'social_accept' then 30 when 'social_remove' then 60 when 'referral' then 10 else 0 end;
 if budget=0 then raise insufficient_privilege;end if;
 insert into void_private.write_limits as w values(actor,scope,date_trunc('minute',clock_timestamp()),1)
 on conflict(user_id,action) do update set bucket=excluded.bucket,n=case when w.bucket=excluded.bucket then w.n+1 else 1 end returning n into used;
 if used>budget then raise exception 'RATE_LIMIT' using errcode='P0001';end if;
end;$$;
revoke all on function void_private.social_budget(text) from public,anon,authenticated;
create function void_private.social_write_limit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null then
  perform void_private.social_budget(case when tg_op='DELETE' then 'social_remove' when tg_table_name='follows' then 'social_follow' when tg_op='UPDATE' then 'social_accept' else 'social_invite' end);
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
revoke all on function void_private.social_write_limit() from public,anon,authenticated;
create trigger friendship_rate before insert or update or delete on public.void_friendships for each row execute function void_private.social_write_limit();
create trigger follow_rate before insert or delete on public.follows for each row execute function void_private.social_write_limit();

create function void_private.referral_budget() returns void language sql security definer set search_path='' as $$select void_private.social_budget('referral');$$;
revoke all on function void_private.referral_budget() from public,anon,authenticated;
grant execute on function void_private.referral_budget() to authenticated;
create function public.void_request_friend(handle text) returns text language plpgsql security invoker set search_path='' as $$
declare actor uuid:=auth.uid();target uuid;identity jsonb;relation public.void_friendships;
begin
 if actor is null then raise insufficient_privilege;end if;
 perform void_private.referral_budget();
 identity:=public.void_people_resolve(lower(ltrim(trim(handle),'@')));
 target:=(identity->>'user_id')::uuid;
 if target is null then return 'missing';end if;
 if target=actor then return 'self';end if;
 -- Serialize requests in either direction. Existing RLS still controls the insert.
 perform pg_advisory_xact_lock(hashtextextended('void-friend:'||least(actor,target)::text||':'||greatest(actor,target)::text,0));
 select * into relation from public.void_friendships where (sender=actor and recipient=target) or (sender=target and recipient=actor);
 if relation.status='accepted' or target=any(public.void_detail_friend_ids()) then return 'friends';end if;
 if relation.status='pending' then return case when relation.sender=actor then 'sent' else 'received' end;end if;
 insert into public.void_friendships(sender,recipient,status) values(actor,target,'pending');
 return 'sent';
end;$$;
revoke all on function public.void_request_friend(text) from public,anon,authenticated;
grant execute on function public.void_request_friend(text) to authenticated;
commit;
