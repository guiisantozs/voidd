begin;

create function public.void_username_valid(value text) returns boolean
language sql immutable parallel safe set search_path='' as $$
 select coalesce(length(value) between 3 and 20 and value ~ '^[a-z0-9][a-z0-9._]*[a-z0-9]$'
 and value !~ '[._]{2}' and value <> all(array['admin','admins','administrator','administrador','moderador','moderator','void','suporte','support','api','root','login','logout','entrar','sair','perfil','profile','filmes','series','jogos','animes','universos','amigos','conta','cadastro','signup','signin','auth','oauth','settings','configuracoes','pessoas','users','user','u','www','mail','email','help','ajuda','about','sobre','oficial','official','staff','team','equipe','null','undefined','system','sistema','security','seguranca']),false);
$$;
revoke all on function public.void_username_valid(text) from public;
grant execute on function public.void_username_valid(text) to anon,authenticated;

alter table public.void_community_profiles drop constraint profile_username_shape;
alter table public.void_community_profiles alter column username drop not null;
alter table public.void_community_profiles add column username_changed_at timestamptz;
-- NULL is a pending identity, not an assigned @. The application gate and write guard
-- require a valid claim before participation. Preserve every existing valid handle.
update public.void_community_profiles set username=null where not public.void_username_valid(username);
alter table public.void_community_profiles add constraint profile_username_shape check(username is null or public.void_username_valid(username));
alter table public.void_community_profiles drop constraint void_community_profiles_username_key;
create unique index profile_username_lower_unique on public.void_community_profiles(lower(username));
create index profile_username_prefix on public.void_community_profiles(username text_pattern_ops) where username is not null;

create table public.username_history(
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 username text not null check(public.void_username_valid(username)),
 claimed_at timestamptz not null,
 released_at timestamptz not null default now(),
 reserved_until timestamptz not null default(now()+interval '30 days')
);
create index username_history_reservation on public.username_history(lower(username),reserved_until desc);
create index username_history_owner on public.username_history(user_id,released_at desc);
alter table public.username_history enable row level security;
revoke all on public.username_history from public,anon,authenticated;
grant select on public.username_history to authenticated;
create policy history_owner on public.username_history for select to authenticated using(user_id=(select auth.uid()));

create or replace function void_private.profile_defaults() returns trigger language plpgsql security definer set search_path='' as $$
begin
 select coalesce(created_at,now()) into new.joined_at from auth.users where id=new.user_id;
 return new;
end;$$;

create function void_private.username_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare previous text; previous_time timestamptz; handle text;
begin
 if tg_op='UPDATE' then
  if new.username is not distinct from old.username then new.username_changed_at:=old.username_changed_at;return new;end if;
  previous:=old.username;previous_time:=old.username_changed_at;
 end if;
 if new.username is null then
  if previous is not null then raise exception 'USERNAME_REQUIRED' using errcode='23514';end if;
  new.username_changed_at:=null;return new;
 end if;
 if not public.void_username_valid(new.username) then raise exception 'USERNAME_INVALID' using errcode='23514';end if;
 -- Lock old and new names in the same order. A concurrent claim of a released name
 -- waits for the reservation transaction, then observes its committed history.
 for handle in select distinct n from unnest(array[new.username,previous]) n where n is not null order by n loop
  perform pg_advisory_xact_lock(hashtextextended('void-username:'||handle,0));
 end loop;
 if previous_time>now()-interval '30 days' then raise exception 'USERNAME_COOLDOWN' using errcode='23514';end if;
 if exists(select 1 from public.username_history h where lower(h.username)=lower(new.username) and h.reserved_until>now() and h.user_id<>new.user_id) then raise exception 'USERNAME_RESERVED' using errcode='23505';end if;
 if previous is not null then
  insert into public.username_history(user_id,username,claimed_at) values(new.user_id,previous,coalesce(previous_time,old.joined_at));
 end if;
 new.username_changed_at:=now();return new;
end;$$;
revoke all on function void_private.username_guard() from public,anon,authenticated;
create trigger community_username_guard before insert or update on public.void_community_profiles for each row execute function void_private.username_guard();

insert into public.void_community_profiles(user_id,display_name,visibility)
select u.id,left(coalesce(nullif(trim(p.display_name),''),nullif(trim(u.raw_user_meta_data->>'display_name'),''),'Pessoa do VOID'),50),'private'
from auth.users u left join public.void_profiles p on p.user_id=u.id
where not exists(select 1 from public.void_community_profiles c where c.user_id=u.id);

create function void_private.username_signup() returns trigger language plpgsql security definer set search_path='' as $$
declare handle text:=new.raw_user_meta_data->>'username';label text;
begin
 label:=left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),'Pessoa do VOID'),50);
 -- Metadata supplies a candidate only; all validation, locks and uniqueness still
 -- run in username_guard. OAuth identities without a candidate enter onboarding.
 if handle is not null and not public.void_username_valid(handle) then raise exception 'USERNAME_INVALID';end if;
 insert into public.void_community_profiles(user_id,display_name,username,visibility) values(new.id,label,handle,'private');
 return new;
end;$$;
revoke all on function void_private.username_signup() from public,anon,authenticated;
create trigger void_username_signup after insert on auth.users for each row execute function void_private.username_signup();

create table void_private.identity_limits(actor text not null,window_start timestamptz not null,total integer not null,primary key(actor,window_start));
create index identity_limits_expiry on void_private.identity_limits(window_start);
alter table void_private.identity_limits enable row level security;
revoke all on void_private.identity_limits from public,anon,authenticated;
create function void_private.identity_limit(scope text) returns void language plpgsql security definer set search_path='' as $$
declare bucket timestamptz:=date_trunc('minute',now());actor_key text:=coalesce(auth.uid()::text,'anonymous');hits integer;
begin
 delete from void_private.identity_limits where window_start<bucket-interval '2 minutes';
 insert into void_private.identity_limits values(scope||':'||actor_key,bucket,1)
 on conflict(actor,window_start) do update set total=identity_limits.total+1 returning total into hits;
 -- Anonymous requests share a hard aggregate budget, so spoofed headers and
 -- multiple Vercel instances cannot bypass the database limit.
 if hits>(case when auth.uid() is null then 120 else 40 end) then raise exception 'RATE_LIMIT' using errcode='P0001';end if;
end;$$;
revoke all on function void_private.identity_limit(text) from public,anon,authenticated;

create function void_private.username_check(candidate text) returns text language plpgsql security definer set search_path='' as $$
begin
 perform void_private.identity_limit('username');
 if not public.void_username_valid(candidate) then return 'invalid';end if;
 if exists(select 1 from public.void_community_profiles where username=candidate and user_id<>coalesce(auth.uid(),'00000000-0000-0000-0000-000000000000')) then return 'taken';end if;
 if exists(select 1 from public.username_history where lower(username)=candidate and reserved_until>now() and user_id<>coalesce(auth.uid(),'00000000-0000-0000-0000-000000000000')) then return 'taken';end if;
 if exists(select 1 from public.void_community_profiles where user_id=auth.uid() and username is distinct from candidate and username_changed_at>now()-interval '30 days') then return 'cooldown';end if;
 return 'available';
end;$$;
create function public.void_username_check(candidate text) returns text language sql security invoker set search_path='' as $$select void_private.username_check(candidate);$$;

create function void_private.identities(ids uuid[]) returns table(user_id uuid,display_name text,username text,avatar_url text)
language sql stable security definer set search_path='' as $$
 select p.user_id,p.display_name,p.username,p.avatar_url from public.void_community_profiles p
 where cardinality(ids)<=50 and p.user_id=any(ids);
$$;
create function public.void_identities(ids uuid[]) returns table(user_id uuid,display_name text,username text,avatar_url text)
language sql stable security invoker set search_path='' as $$select * from void_private.identities(ids);$$;

create function void_private.people_search(term text) returns jsonb language plpgsql security definer set search_path='' as $$
declare q text:=lower(ltrim(trim(term),'@'));result jsonb;
begin
 perform void_private.identity_limit('people');
 if length(q)<2 or length(q)>20 or q !~ '^[a-z0-9][a-z0-9._]*$' or q ~ '[._]{2}' then return '[]'::jsonb;end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.exact desc,t.username),'[]'::jsonb) into result from (
  select p.user_id,p.display_name,p.username,p.avatar_url,p.username=q exact,
   exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followed_id=p.user_id) following
  from public.void_community_profiles p where p.username>=q and p.username<q||chr(127) and left(p.username,length(q))=q order by (p.username=q) desc,p.username limit 10
 )t;return result;
end;$$;
create function public.void_people_search(term text) returns jsonb language sql security invoker set search_path='' as $$select void_private.people_search(term);$$;

create function void_private.people_resolve(handle text) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid;normalized text:=lower(handle);
begin
 perform void_private.identity_limit('resolve');
 if not public.void_username_valid(normalized) then return null;end if;
 select user_id into uid from public.void_community_profiles where username=normalized;
 if uid is null then select user_id into uid from public.username_history where username=normalized and reserved_until>now() order by released_at desc limit 1;end if;
 return(select to_jsonb(t) from (select user_id,display_name,username,avatar_url from public.void_community_profiles where user_id=uid)t);
end;$$;
create function public.void_people_resolve(handle text) returns jsonb language sql security invoker set search_path='' as $$select void_private.people_resolve(handle);$$;

create function public.void_username_self() returns jsonb language sql stable security invoker set search_path='' as $$
 select to_jsonb(t) from(select username,display_name,username_changed_at from public.void_community_profiles where user_id=auth.uid())t;
$$;
create function public.void_username_claim(candidate text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 update public.void_community_profiles set username=candidate where user_id=auth.uid();
 if not found then raise exception 'PROFILE_MISSING';end if;
end;$$;

revoke all on function void_private.username_check(text),void_private.identities(uuid[]),void_private.people_search(text),void_private.people_resolve(text),public.void_username_check(text),public.void_identities(uuid[]),public.void_people_search(text),public.void_people_resolve(text),public.void_username_self(),public.void_username_claim(text) from public,anon,authenticated;
grant execute on function void_private.username_check(text),void_private.identities(uuid[]),void_private.people_search(text),void_private.people_resolve(text),public.void_username_check(text),public.void_identities(uuid[]),public.void_people_search(text),public.void_people_resolve(text) to anon,authenticated;
grant execute on function public.void_username_self(),public.void_username_claim(text) to authenticated;

create function void_private.require_username() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and not exists(select 1 from public.void_community_profiles where user_id=auth.uid() and username is not null) then raise exception 'USERNAME_REQUIRED' using errcode='42501';end if;
 return new;
end;$$;
revoke all on function void_private.require_username() from public,anon,authenticated;
create trigger records_username_required before insert or update on public.void_records for each row execute function void_private.require_username();
create trigger follows_username_required before insert on public.follows for each row execute function void_private.require_username();
create trigger friends_username_required before insert or update on public.void_friendships for each row execute function void_private.require_username();
create trigger favorites_username_required before insert or update on public.profile_favorites for each row execute function void_private.require_username();
create trigger comments_username_required before insert or update on public.void_review_comments for each row execute function void_private.require_username();
create trigger likes_username_required before insert on public.void_review_likes for each row execute function void_private.require_username();

-- Avatar is now part of the explicitly public identity; bio, banner, records and
-- favorites retain the original profile visibility/RLS. Only the current photo.
create function void_private.identity_avatar_visible(object_name text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.void_community_profiles p where p.user_id::text=(storage.foldername(object_name))[1] and right(p.avatar_url,length(object_name)+1)='/'||object_name);
$$;
revoke all on function void_private.identity_avatar_visible(text) from public;
grant execute on function void_private.identity_avatar_visible(text) to anon,authenticated;
drop policy void_avatar_read on storage.objects;
create policy void_avatar_read on storage.objects for select to anon,authenticated using(bucket_id='profile-avatars' and ((storage.foldername(name))[1]=(select auth.uid())::text or void_private.identity_avatar_visible(name)));

commit;
