begin;

-- Catalog facts are written only by the server after fetching TMDB, never by
-- the reviewer. Existing storage, primary keys and aggregate views are reused.
create table public.void_movie_releases(
 movie_id bigint primary key check(movie_id>0),release_date date,
 release_status text not null default '',checked_at timestamptz not null default now()
);
alter table public.void_movie_releases enable row level security;
revoke all on public.void_movie_releases from public,anon,authenticated;
grant select on public.void_movie_releases to anon,authenticated;
grant select,insert,update on public.void_movie_releases to service_role;
create policy release_read on public.void_movie_releases for select to anon,authenticated using(true);

create table void_private.review_release_archive(
 user_id uuid not null references auth.users(id) on delete cascade,item_key text not null,
 payload jsonb not null,created_at timestamptz not null,updated_at timestamptz not null,
 reason text not null,release_date date,archived_at timestamptz not null default now(),
 restored_at timestamptz,primary key(user_id,item_key)
);
alter table void_private.review_release_archive enable row level security;
revoke all on void_private.review_release_archive from public,anon,authenticated;

create function void_private.review_release_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare fact public.void_movie_releases;today date:=(clock_timestamp() at time zone 'America/Sao_Paulo')::date;
begin
 if tg_op='UPDATE' then new.created_at:=old.created_at;else new.created_at:=clock_timestamp();end if;
 if new.kind<>'review' or new.payload is null or new.item_key not like 'filmes:%' then return new;end if;
 select * into fact from public.void_movie_releases where movie_id=split_part(new.item_key,':',2)::bigint;
 if not found or fact.checked_at<now()-interval '24 hours' then raise exception 'MOVIE_RELEASE_UNKNOWN' using errcode='23514';end if;
 if fact.release_date is null and fact.release_status<>'Released' then raise exception 'MOVIE_RELEASE_UNKNOWN' using errcode='23514';end if;
 if fact.release_date>today then raise exception 'MOVIE_UNRELEASED' using errcode='23514';end if;
 return new;
end;$$;
revoke all on function void_private.review_release_guard() from public,anon,authenticated;
create trigger record_release_guard before insert or update on public.void_records for each row execute function void_private.review_release_guard();

create function void_private.release_budget() returns void language plpgsql security definer set search_path='' as $$
begin if auth.uid() is null then raise insufficient_privilege;end if;perform void_private.identity_limit('movie_release');end;$$;
revoke all on function void_private.release_budget() from public,anon,authenticated;
grant execute on function void_private.release_budget() to authenticated;
create function public.void_movie_release_budget() returns void language sql security invoker set search_path='' as $$select void_private.release_budget();$$;
revoke all on function public.void_movie_release_budget() from public,anon,authenticated;
grant execute on function public.void_movie_release_budget() to authenticated;

-- Only currently unreleased titles are conclusive without an immutable history.
-- Older timestamps remain evidence for review, not grounds for bulk deletion.
create function void_private.quarantine_unreleased_reviews() returns integer language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
 insert into void_private.review_release_archive(user_id,item_key,payload,created_at,updated_at,reason,release_date)
 select r.user_id,r.item_key,r.payload,r.created_at,r.updated_at,'unreleased_at_audit',f.release_date
 from public.void_records r join public.void_movie_releases f on f.movie_id=split_part(r.item_key,':',2)::bigint
 where r.kind='review' and r.item_key like 'filmes:%' and r.payload is not null
 and f.checked_at>=now()-interval '24 hours' and f.release_date>(clock_timestamp() at time zone 'America/Sao_Paulo')::date
 on conflict(user_id,item_key) do nothing;
 update public.void_records r set payload=null from void_private.review_release_archive a
 where r.user_id=a.user_id and r.kind='review' and r.item_key=a.item_key and a.restored_at is null
 and r.payload=a.payload and exists(select 1 from public.void_movie_releases f where f.movie_id=split_part(r.item_key,':',2)::bigint and f.release_date>(clock_timestamp() at time zone 'America/Sao_Paulo')::date and f.checked_at>=now()-interval '24 hours');
 get diagnostics affected=row_count;return affected;
end;$$;
revoke all on function void_private.quarantine_unreleased_reviews() from public,anon,authenticated;

-- The authoritative, extensible rules live in the database. Full-word/phrase
-- matches avoid banning ordinary words that merely contain a prohibited token.
create table void_private.prohibited_names(term text primary key,reason text not null,enabled boolean not null default true);
alter table void_private.prohibited_names enable row level security;
revoke all on void_private.prohibited_names from public,anon,authenticated;
insert into void_private.prohibited_names(term,reason) values
 ('caralho','obscenidade'),('buceta','obscenidade'),('cuzao','ofensa'),('arrombado','ofensa'),
 ('filho da puta','ofensa'),('vai se foder','ofensa'),('foda se','ofensa'),('puta','obscenidade'),
 ('nazista','discriminacao'),('heil hitler','discriminacao'),('supremacia branca','discriminacao'),
 ('vou te matar','ameaca'),('vou te estuprar','ameaca'),('nigger','discriminacao'),('faggot','discriminacao');

create function void_private.name_normalize(value text) returns text language sql immutable set search_path='' as $$
 select trim(regexp_replace(translate(translate(lower(coalesce(value,'')),
 'áàâãäéèêëíìîïóòôõöúùûüçñ','aaaaaeeeeiiiiooooouuuucn'),
 '0134578@$!','oieastbasi'),'[^a-z]+',' ','g'));
$$;
create function void_private.name_allowed(value text) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from void_private.prohibited_names p where p.enabled and
 exists(select 1 from generate_series(0,least(length(coalesce(value,'')),100)) suffix where
 (suffix=0 or right(value,suffix) ~ '^[0-9]+$') and
 void_private.name_normalize(left(value,length(value)-suffix)) ~ ('(^| )'||(select string_agg(letter||'+ *','' order by position) from regexp_split_to_table(replace(void_private.name_normalize(p.term),' ',''),'') with ordinality t(letter,position))||'( |$)')));
$$;
revoke all on function void_private.name_normalize(text),void_private.name_allowed(text) from public,anon,authenticated;
create function public.void_name_check(value text) returns boolean language sql stable security invoker set search_path='' as $$select void_private.name_allowed(left(value,100));$$;
revoke all on function public.void_name_check(text) from public;
grant execute on function public.void_name_check(text),void_private.name_allowed(text) to anon,authenticated;

create table void_private.profile_name_flags(
 user_id uuid primary key references auth.users(id) on delete cascade,
 username_required boolean not null,display_required boolean not null,account_display_required boolean not null,
 reason text not null default 'prohibited_name',flagged_at timestamptz not null default now(),resolved_at timestamptz
);
alter table void_private.profile_name_flags enable row level security;
revoke all on void_private.profile_name_flags from public,anon,authenticated;
insert into void_private.profile_name_flags(user_id,username_required,display_required,account_display_required)
 select p.user_id,not void_private.name_allowed(p.username),not void_private.name_allowed(p.display_name),not void_private.name_allowed(a.display_name)
 from public.void_community_profiles p left join public.void_profiles a using(user_id)
 where not void_private.name_allowed(p.username) or not void_private.name_allowed(p.display_name) or not void_private.name_allowed(a.display_name);

create function void_private.profile_name_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not void_private.name_allowed(new.display_name) then raise exception 'NAME_PROHIBITED' using errcode='23514';end if;
 if tg_table_name='void_community_profiles' then
  if not void_private.name_allowed(new.username) then raise exception 'NAME_PROHIBITED' using errcode='23514';end if;
 end if;
 return new;
end;$$;
revoke all on function void_private.profile_name_guard() from public,anon,authenticated;
create trigger aa_profile_name_guard before insert or update on public.void_community_profiles for each row execute function void_private.profile_name_guard();
create trigger aa_account_name_guard before insert or update on public.void_profiles for each row execute function void_private.profile_name_guard();

create or replace function void_private.require_username() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null then
  if not exists(select 1 from public.void_community_profiles where user_id=auth.uid() and username is not null) then raise exception 'USERNAME_REQUIRED' using errcode='42501';end if;
  if exists(select 1 from public.void_community_profiles p left join public.void_profiles a using(user_id) where p.user_id=auth.uid() and (not void_private.name_allowed(p.username) or not void_private.name_allowed(p.display_name) or not void_private.name_allowed(a.display_name))) then raise exception 'NAME_CORRECTION_REQUIRED' using errcode='42501';end if;
 end if;return new;
end;$$;

create or replace function public.void_username_self() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('username',p.username,'display_name',p.display_name,'username_changed_at',p.username_changed_at,
 'username_required',not void_private.name_allowed(p.username),'display_required',not void_private.name_allowed(p.display_name),
 'account_display_required',not void_private.name_allowed(a.display_name))
 from public.void_community_profiles p left join public.void_profiles a using(user_id) where p.user_id=auth.uid();
$$;

create function void_private.correct_profile_name(candidate text,label text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();p public.void_community_profiles;
begin
 if actor is null then raise insufficient_privilege;end if;
 perform void_private.identity_limit('name_correction');
 select * into p from public.void_community_profiles where user_id=actor for update;
 if not found then raise insufficient_privilege;end if;
 if not void_private.name_allowed(candidate) or not void_private.name_allowed(label) or length(trim(label)) not between 1 and 50 then raise exception 'NAME_PROHIBITED' using errcode='23514';end if;
 -- A display-only correction must never consume a username change/cooldown.
 if void_private.name_allowed(p.username) and p.username is not null and candidate is distinct from p.username then raise exception 'USERNAME_UNCHANGED_REQUIRED' using errcode='23514';end if;
 update public.void_community_profiles set username=candidate,display_name=trim(label) where user_id=actor;
 update public.void_profiles set display_name=trim(label) where user_id=actor and not void_private.name_allowed(display_name);
 update void_private.profile_name_flags set resolved_at=now() where user_id=actor;
end;$$;
revoke all on function void_private.correct_profile_name(text,text) from public,anon,authenticated;
grant execute on function void_private.correct_profile_name(text,text) to authenticated;
create function public.void_profile_name_correct(candidate text,label text) returns void language sql security invoker set search_path='' as $$select void_private.correct_profile_name(candidate,label);$$;
revoke all on function public.void_profile_name_correct(text,text) from public,anon,authenticated;
grant execute on function public.void_profile_name_correct(text,text) to authenticated;

create function void_private.restore_release_review(owner_id uuid,movie_key text) returns boolean language plpgsql security definer set search_path='' as $$
declare backup void_private.review_release_archive;
begin
 select * into backup from void_private.review_release_archive where user_id=owner_id and item_key=movie_key and restored_at is null for update;
 if not found then return false;end if;
 -- The normal release guard still runs. Restoration cannot republish a future
 -- film or overwrite a newer review made after the quarantine.
 update public.void_records set payload=backup.payload where user_id=owner_id and kind='review' and item_key=movie_key and payload is null;
 if not found then return false;end if;
 update void_private.review_release_archive set restored_at=now() where user_id=owner_id and item_key=movie_key;
 return true;
end;$$;
revoke all on function void_private.restore_release_review(uuid,text) from public,anon,authenticated;

create or replace function void_private.username_guard() returns trigger language plpgsql security definer set search_path='' as $$
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
 if previous_time>now()-interval '30 days' and void_private.name_allowed(previous) then raise exception 'USERNAME_COOLDOWN' using errcode='23514';end if;
 if exists(select 1 from public.username_history h where lower(h.username)=lower(new.username) and h.reserved_until>now() and h.user_id<>new.user_id) then raise exception 'USERNAME_RESERVED' using errcode='23505';end if;
 if previous is not null then
  insert into public.username_history(user_id,username,claimed_at) values(new.user_id,previous,coalesce(previous_time,old.joined_at));
 end if;
 new.username_changed_at:=now();return new;
end;$$;
create or replace function void_private.username_check(candidate text) returns text language plpgsql security definer set search_path='' as $$
begin
 perform void_private.identity_limit('username');
 if not void_private.name_allowed(candidate) then return 'prohibited';end if;
 if not public.void_username_valid(candidate) then return 'invalid';end if;
 if exists(select 1 from public.void_community_profiles where username=candidate and user_id<>coalesce(auth.uid(),'00000000-0000-0000-0000-000000000000')) then return 'taken';end if;
 if exists(select 1 from public.username_history where lower(username)=candidate and reserved_until>now() and user_id<>coalesce(auth.uid(),'00000000-0000-0000-0000-000000000000')) then return 'taken';end if;
 if exists(select 1 from public.void_community_profiles where user_id=auth.uid() and username is distinct from candidate and void_private.name_allowed(username) and username_changed_at>now()-interval '30 days') then return 'cooldown';end if;
 return 'available';
end;$$;
commit;
