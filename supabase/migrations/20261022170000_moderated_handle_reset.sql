begin;
insert into void_private.prohibited_names(term,reason) values ('molestador de utero','moderated_handle') on conflict(term) do update set enabled=true;
create or replace function void_private.username_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare previous text; previous_time timestamptz; handle text;
begin
 if tg_op='UPDATE' then
  if new.username is not distinct from old.username then new.username_changed_at:=old.username_changed_at;return new;end if;
  previous:=old.username;previous_time:=old.username_changed_at;
 end if;
 if new.username is null then
  if previous is not null then
   -- Only an administrative write may clear a prohibited handle. RLS still applies.
   if auth.uid() is not null or void_private.name_allowed(previous) then raise exception 'USERNAME_REQUIRED' using errcode='23514';end if;
   insert into public.username_history(user_id,username,claimed_at) values(new.user_id,previous,coalesce(previous_time,old.joined_at));
  end if;
  new.username_changed_at:=null;return new;
 end if;
 if not public.void_username_valid(new.username) then raise exception 'USERNAME_INVALID' using errcode='23514';end if;
 -- Lock old and new names in the same order. A concurrent claim of a released name
 -- waits for the reservation transaction, then observes its committed history.
 for handle in select distinct n from unnest(array[new.username,previous]) n where n is not null order by n loop
  perform pg_advisory_xact_lock(hashtextextended('void-username:'||handle,0));
 end loop;
 if previous_time>now()-interval '30 days' and void_private.name_allowed(previous) then raise exception 'USERNAME_COOLDOWN' using errcode='23514';end if;
 if exists(select 1 from public.username_history h where lower(h.username)=lower(new.username) and h.reserved_until>now() and h.user_id<>new.user_id) then raise exception 'USERNAME_RESERVED' using errcode='23505';end if;
 if previous is not null then
  insert into public.username_history(user_id,username,claimed_at) values(new.user_id,previous,coalesce(previous_time,old.joined_at));
 end if;
 new.username_changed_at:=now();return new;
end;$$;
create or replace function public.void_username_self() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('username',p.username,'display_name',p.display_name,'username_changed_at',p.username_changed_at,
 'username_required',not void_private.name_allowed(p.username) or (p.username is null and exists(select 1 from public.username_history h where h.user_id=p.user_id and not void_private.name_allowed(h.username))),'display_required',not void_private.name_allowed(p.display_name),
 'account_display_required',not void_private.name_allowed(a.display_name))
 from public.void_community_profiles p left join public.void_profiles a using(user_id) where p.user_id=auth.uid();
$$;
-- A historical, account-specific operational correction is intentionally omitted
-- from the public schema source. Moderation rules and guards above are retained.
-- Do not reapply this already deployed migration to an existing database.
commit;
