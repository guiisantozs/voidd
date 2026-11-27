begin;
-- Additive: existing lists, watchlists and personal reviews retain their data and visibility.
alter table public.lists add column collaboration_enabled boolean not null default false;
alter table public.lists add column cover_key text check(cover_key is null or cover_key ~ '^(filmes|series|jogos|animes):[1-9][0-9]{0,14}$');
alter table public.lists add constraint standard_not_collaborative check(source_key is null or not collaboration_enabled);
alter table public.list_items add column added_by uuid references auth.users(id) on delete set null;
create index list_items_added_by on public.list_items(added_by);
-- DDL holds the table lock for this transaction. Backfill attribution without changing
-- existing snapshots, added_at, list versions or requiring an end-user JWT.
alter table public.list_items disable trigger list_item_guard;
alter table public.list_items disable trigger list_item_touch;
update public.list_items i set added_by=l.owner_id from public.lists l where l.id=i.list_id;
alter table public.list_items enable trigger list_item_guard;
alter table public.list_items enable trigger list_item_touch;
create table public.list_members(
 list_id uuid not null references public.lists(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 status text not null check(status in('pending','accepted','declined','removed')),
 invited_at timestamptz not null default now(),responded_at timestamptz,joined_at timestamptz,
 primary key(list_id,user_id)
);
create index list_members_inbox on public.list_members(user_id,status,invited_at desc);
create table public.list_progress(
 list_id uuid not null,media_type text not null,external_id text not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 completed_at timestamptz not null default now(),
 primary key(list_id,media_type,external_id,user_id),
 foreign key(list_id,media_type,external_id) references public.list_items on delete cascade
);
create index list_progress_user on public.list_progress(user_id,list_id);
alter table public.list_members enable row level security;
alter table public.list_progress enable row level security;
revoke all on public.list_members,public.list_progress from public,anon,authenticated;
grant select on public.list_members,public.list_progress to authenticated;

-- Private lookup avoids recursive RLS. Only current authenticated membership is tested.
create function void_private.list_participant(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.lists l where l.id=target and l.source_key is null and
 (l.owner_id=auth.uid() or l.collaboration_enabled and exists(select 1 from public.list_members m where m.list_id=l.id and m.user_id=auth.uid() and m.status='accepted')));
$$;
revoke all on function void_private.list_participant(uuid) from public,anon,authenticated;
grant execute on function void_private.list_participant(uuid) to anon,authenticated;
create policy lists_participant_read on public.lists for select to authenticated using(void_private.list_participant(id));
create policy members_read on public.list_members for select to authenticated using(user_id=auth.uid() or void_private.list_participant(list_id));
create policy progress_read on public.list_progress for select to authenticated using(void_private.list_participant(list_id));

-- Locking and item writes remain behind authenticated RPCs, never arbitrary table grants.
create function void_private.collaborative_item(target uuid,entry jsonb,present boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare l public.lists;author uuid;n integer;
begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 select * into l from public.lists where id=target for update;
 if not found or not void_private.list_participant(target) then raise insufficient_privilege;end if;
 perform void_private.list_limit('list_action');
 if present is null or entry->>'media_type' is null or not(entry->>'media_type'=any(l.media_types)) then raise exception 'INVALID_ITEM';end if;
 select added_by into author from public.list_items where list_id=target and media_type=entry->>'media_type' and external_id=entry->>'external_id';
 if present then
  if found then return true;end if;
  select min(p) into n from generate_series(0,199) p where not exists(select 1 from public.list_items where list_id=target and position=p);
  if n is null then raise exception 'LIST_LIMIT';end if;
  insert into public.list_items(list_id,media_type,external_id,position,note,snapshot) values(target,entry->>'media_type',entry->>'external_id',n,coalesce(entry->>'note',''),entry->'snapshot');
 else
  if found and auth.uid()<>l.owner_id and author is distinct from auth.uid() then raise insufficient_privilege;end if;
  delete from public.list_items where list_id=target and media_type=entry->>'media_type' and external_id=entry->>'external_id';
 end if;
 return present;
end;$$;
revoke all on function void_private.collaborative_item(uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function void_private.collaborative_item(uuid,jsonb,boolean) to authenticated;
create or replace function public.void_list_item_toggle(target uuid,entry jsonb,present boolean) returns boolean language sql security invoker set search_path='' as $$select void_private.collaborative_item(target,entry,present);$$;
create or replace function void_private.list_item_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare parent uuid;title text;poster text;
begin
 -- Allow only the FK's anonymization of a deleted author, preserving every other field.
 if tg_op='UPDATE' and new.added_by is null and old.added_by is not null and not exists(select 1 from auth.users where id=old.added_by)
 and (to_jsonb(new)-'added_by')=(to_jsonb(old)-'added_by') then return new;end if;
 if tg_op='UPDATE' and (new.list_id,new.media_type,new.external_id) is distinct from (old.list_id,old.media_type,old.external_id) then raise exception 'INVALID_ITEM';end if;
 select id into parent from public.lists where id=new.list_id and void_private.list_participant(id) for update;
 if parent is null then raise insufficient_privilege;end if;
 if tg_op='INSERT' and (select count(*) from public.list_items where list_id=parent)>=200 and not exists(select 1 from public.list_items where list_id=parent and media_type=new.media_type and external_id=new.external_id) then raise exception 'LIST_LIMIT';end if;
 title:=void_private.list_text(new.snapshot->>'titulo');poster:=coalesce(new.snapshot->>'poster','');
 if length(title) not between 1 and 200 or length(poster)>1000 or (poster<>'' and poster !~ '^https://[^[:space:]]+$') or length(coalesce(new.snapshot->>'ano',''))>20 then raise exception 'INVALID_ITEM';end if;
 new.snapshot:=jsonb_build_object('id',new.external_id,'categoria',new.media_type,'titulo',title,'poster',poster,'ano',void_private.list_text(new.snapshot->>'ano'));
 new.note:=void_private.list_text(new.note);
 if tg_op='INSERT' then new.added_at:=clock_timestamp();new.added_by:=auth.uid();else new.added_at:=old.added_at;new.added_by:=old.added_by;end if;return new;
end;$$;
create or replace function void_private.list_touch() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if tg_op='UPDATE' and new.added_by is null and (to_jsonb(new)-'added_by')=(to_jsonb(old)-'added_by') then return new;end if;
 target:=case when tg_op='DELETE' then old.list_id else new.list_id end;
 if auth.uid() is not null and not void_private.list_participant(target) and exists(select 1 from public.lists where id=target) then raise insufficient_privilege;end if;
 update public.lists set updated_at=clock_timestamp() where id=target;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
create function public.void_list_write_v3(target uuid,metadata jsonb,entries jsonb default null,expected_version timestamptz default null) returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
 if metadata ? 'collaboration_enabled' and jsonb_typeof(metadata->'collaboration_enabled')<>'boolean' then raise exception 'INVALID_LIST';end if;
 result:=public.void_list_write(target,metadata,entries,expected_version);
 if metadata ? 'collaboration_enabled' then update public.lists set collaboration_enabled=(metadata->>'collaboration_enabled')::boolean where id=result and owner_id=auth.uid();end if;
 if metadata ? 'cover_key' then
  if nullif(metadata->>'cover_key','') is not null and not exists(select 1 from public.list_items where list_id=result and media_type||':'||external_id=metadata->>'cover_key') then raise exception 'INVALID_COVER';end if;
  update public.lists set cover_key=nullif(metadata->>'cover_key','') where id=result and owner_id=auth.uid() and source_key is null;
 end if;
 return result;
end;$$;

-- No membership count cap. Per-actor rate limit and one invitation per user/list prevent duplicates.
create function void_private.list_invitation(target uuid,person uuid,action text) returns void language plpgsql security definer set search_path='' as $$
declare l public.lists;m public.list_members;used integer;
begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 select * into l from public.lists where id=target for update;
 if not found or l.source_key is not null then raise insufficient_privilege;end if;
 perform void_private.list_limit('list_action');
 select * into m from public.list_members where list_id=target and user_id=person;
 if action='invite' then
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,42));
  if l.owner_id<>auth.uid() or not l.collaboration_enabled or person=l.owner_id then raise insufficient_privilege;end if;
  if not exists(select 1 from public.void_community_profiles where user_id=person and username is not null) then raise exception 'INVALID_PERSON';end if;
  if m.status in('accepted','pending') then return;end if;
  if m.responded_at>now()-interval '7 days' then raise exception 'INVITE_COOLDOWN';end if;
  -- Durable per-actor hourly quota, not reset by deleting a list or declining an invitation.
  insert into void_private.write_limits as w(user_id,action,bucket,n) values(auth.uid(),'list_invite',date_trunc('hour',clock_timestamp() at time zone 'UTC') at time zone 'UTC',1)
  on conflict on constraint write_limits_pkey do update set bucket=excluded.bucket,n=case when w.bucket=excluded.bucket then w.n+1 else 1 end returning n into used;
  if used>20 then raise exception 'RATE_LIMIT';end if;
  insert into public.list_members(list_id,user_id,status) values(target,person,'pending') on conflict(list_id,user_id) do update set status='pending',invited_at=clock_timestamp(),responded_at=null,joined_at=null;
 elsif action in('accept','decline') then
  if person<>auth.uid() or m.status is distinct from 'pending' or not l.collaboration_enabled then raise insufficient_privilege;end if;
  update public.list_members set status=case when action='accept' then 'accepted' else 'declined' end,responded_at=clock_timestamp(),joined_at=case when action='accept' then clock_timestamp() end where list_id=target and user_id=person;
 elsif action in('remove','cancel','leave') then
  if person=l.owner_id or (action='leave' and (person<>auth.uid() or m.status is distinct from 'accepted')) or (action<>'leave' and l.owner_id<>auth.uid()) then raise insufficient_privilege;end if;
  update public.list_members set status='removed',responded_at=clock_timestamp() where list_id=target and user_id=person;
 else raise exception 'INVALID_ACTION';end if;
end;$$;
revoke all on function void_private.list_invitation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function void_private.list_invitation(uuid,uuid,text) to authenticated;
create function public.void_list_invitation(target uuid,person uuid,action text) returns void language sql security invoker set search_path='' as $$select void_private.list_invitation(target,person,action);$$;

create function void_private.list_people(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('user_id',x.user_id,'status',x.status,'joined_at',x.joined_at,'owner',x.owner,'display_name',p.display_name,'username',p.username,'avatar_url',p.avatar_url) order by x.owner desc,x.joined_at),'[]'::jsonb)
 from (select l.owner_id user_id,'accepted' status,l.created_at joined_at,true owner from public.lists l where l.id=target
 union all select m.user_id,m.status,m.joined_at,false from public.list_members m join public.lists l on l.id=m.list_id where m.list_id=target and (m.status='accepted' or m.status='pending' and l.owner_id=auth.uid()) and l.collaboration_enabled)x
 left join public.void_community_profiles p using(user_id) where void_private.list_participant(target);
$$;
revoke all on function void_private.list_people(uuid) from public,anon,authenticated;
grant execute on function void_private.list_people(uuid) to anon,authenticated;

create function public.void_list_social(target uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 with people as(select * from jsonb_to_recordset(void_private.list_people(target)) as p(user_id uuid,status text)),
 reviews as(select r.user_id,r.item_key,(r.payload->>'nota')::numeric rating,r.updated_at from public.void_records r join people p on p.user_id=r.user_id and p.status='accepted' where r.kind='review' and r.payload is not null and exists(select 1 from public.list_items i where i.list_id=target and r.item_key=i.media_type||':'||i.external_id))
 select jsonb_build_object('participants',void_private.list_people(target),'reviews',coalesce((select jsonb_agg(to_jsonb(r)) from reviews r),'[]'::jsonb),
 'progress',coalesce((select jsonb_agg(to_jsonb(p)) from public.list_progress p join people m using(user_id) where p.list_id=target and m.status='accepted'),'[]'::jsonb));
$$;
create function void_private.list_complete(target uuid,media text,external text,present boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not void_private.list_participant(target) or present is null then raise insufficient_privilege;end if;
 perform 1 from public.lists where id=target for update;
 perform void_private.list_limit('list_action');
 if present then insert into public.list_progress(list_id,media_type,external_id,user_id) values(target,media,external,auth.uid()) on conflict do nothing;
 else delete from public.list_progress where list_id=target and media_type=media and external_id=external and user_id=auth.uid();end if;
end;$$;
revoke all on function void_private.list_complete(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function void_private.list_complete(uuid,text,text,boolean) to authenticated;
create function public.void_list_complete(target uuid,media text,external text,present boolean) returns void language sql security invoker set search_path='' as $$select void_private.list_complete(target,media,external,present);$$;

create function void_private.list_inbox() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('list_id',l.id,'title',l.title,'invited_at',m.invited_at,'display_name',p.display_name,'avatar_url',p.avatar_url) order by m.invited_at desc),'[]'::jsonb)
 from public.list_members m join public.lists l on l.id=m.list_id left join public.void_community_profiles p on p.user_id=l.owner_id
 where auth.uid() is not null and m.user_id=auth.uid() and m.status='pending' and l.collaboration_enabled;
$$;
revoke all on function void_private.list_inbox() from public,anon,authenticated;
grant execute on function void_private.list_inbox() to authenticated;
create function public.void_list_inbox() returns jsonb language sql stable security invoker set search_path='' as $$select void_private.list_inbox();$$;
create or replace function public.void_list_detail(target uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select to_jsonb(l)||jsonb_build_object('display_name',coalesce(p.display_name,void_private.list_people(l.id)->0->>'display_name'),'username',coalesce(p.username,void_private.list_people(l.id)->0->>'username'),'avatar_url',coalesce(p.avatar_url,void_private.list_people(l.id)->0->>'avatar_url'),
 'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.position) from public.void_list_entries i where i.list_id=l.id),'[]'::jsonb),
 'item_authors',coalesce((select jsonb_agg(jsonb_build_object('media_type',a.media_type,'external_id',a.external_id,'added_by',a.added_by)) from public.list_items a where a.list_id=l.id),'[]'::jsonb), 'likes',(select count(*) from public.list_likes where list_id=l.id),
 'liked',exists(select 1 from public.list_likes where list_id=l.id and user_id=auth.uid()),
 'saved',exists(select 1 from public.list_saves where list_id=l.id and user_id=auth.uid()))
 from public.lists l left join public.void_community_profiles p on p.user_id=l.owner_id where l.id=target;
$$;
create or replace function public.void_lists_page_v2(section text default 'discover',ordering text default 'recent',target uuid default null,page_number integer default 0,media_filter text default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if section not in('mine','discover','following','saved','profile') or ordering not in('recent','popular') or page_number not between 0 and 10000 then raise exception 'INVALID_QUERY';end if;
 if media_filter is not null and media_filter not in('filmes','series','jogos','animes') then raise exception 'INVALID_QUERY';end if;
 with candidates as(
  select l.*,p.display_name,p.username,p.avatar_url,exists(select 1 from public.list_likes k where k.list_id=l.id and k.user_id=(select auth.uid())) liked,(select count(*) from public.list_likes k where k.list_id=l.id) likes
  from public.lists l left join public.void_community_profiles p on p.user_id=l.owner_id
  where (section not in('discover','following') or l.source_key is null) and (media_filter is null or l.media_types @> array[media_filter]) and case section when 'mine' then (l.owner_id=auth.uid() or void_private.list_participant(l.id)) and l.source_key is null when 'saved' then exists(select 1 from public.list_saves s where s.list_id=l.id and s.user_id=auth.uid()) when 'following' then exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followed_id=l.owner_id) when 'profile' then l.owner_id=target else l.visibility='public' end
  order by case when ordering='popular' then(select count(*) from public.list_likes k where k.list_id=l.id) else 0 end desc,l.updated_at desc,l.id desc limit 13 offset page_number*12
 ), numbered as(select *,row_number() over(order by case when ordering='popular' then likes else 0 end desc,updated_at desc,id desc) rn from candidates)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(t)-'rn' order by rn) from(
  select n.*,(select count(*) from public.void_list_entries i where i.list_id=n.id) item_count,
  coalesce((select jsonb_agg(c.snapshot order by c.position) from(select snapshot,position from public.void_list_entries where list_id=n.id order by (media_type||':'||external_id=n.cover_key) desc nulls last,position limit (case when n.cover_key is null then 4 else 1 end))c),'[]'::jsonb) cover
  from numbered n where rn<=12)t),'[]'::jsonb),'has_more',(select count(*)>12 from candidates)) into result;
 return result;
end;$$;
alter table public.notification_preferences add column list_invite boolean not null default true;
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check(type in('friend_request','friend_accepted','follower','review_like','review_comment','mention','achievement','watchlist_review','list_invite'));
alter table public.notifications drop constraint notifications_entity_type_check;
alter table public.notifications add constraint notifications_entity_type_check check(entity_type in('profile','review','achievement','list'));
create function void_private.list_invite_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare owner uuid;
begin
 delete from public.notifications where type='list_invite' and entity_id=new.list_id::text and user_id=new.user_id;
 if new.status='pending' then
  select owner_id into owner from public.lists where id=new.list_id;
  perform void_private.notify(new.user_id,owner,'list_invite','list',new.list_id::text,'{}','list-invite:'||new.list_id||':'||new.invited_at);
 end if;
 return new;
end;$$;
revoke all on function void_private.list_invite_notification() from public,anon,authenticated;
create trigger list_invite_notification after insert or update on public.list_members for each row execute function void_private.list_invite_notification();
create function void_private.collaboration_disable() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not new.collaboration_enabled and old.collaboration_enabled then update public.list_members set status='removed',responded_at=clock_timestamp() where list_id=new.id and status in('pending','accepted');end if;
 return new;
end;$$;
revoke all on function void_private.collaboration_disable() from public,anon,authenticated;
create trigger collaboration_disable after update of collaboration_enabled on public.lists for each row execute function void_private.collaboration_disable();
create or replace function void_private.notification_visible(n public.notifications) returns boolean
language sql stable security definer set search_path='' as $$
 select n.user_id=auth.uid() and n.created_at>=now()-interval '90 days' and
 case when n.entity_type='list' then exists(select 1 from public.list_members m join public.lists l on l.id=m.list_id where m.list_id::text=n.entity_id and m.user_id=auth.uid() and m.status='pending' and l.collaboration_enabled) when n.entity_type='review' then exists(
  select 1 from public.void_records r where r.user_id=(n.data->>'review_user')::uuid
   and r.kind='review' and r.item_key=n.data->>'item_key' and r.payload is not null
   and (r.user_id=n.user_id or (r.is_public and void_private.notification_profile_access(r.user_id,n.user_id)))
   and (not(n.data ? 'comment_id') or exists(select 1 from public.void_review_comments c where c.id=(n.data->>'comment_id')::uuid))
 ) else true end;
$$;
revoke all on function public.void_list_write_v3(uuid,jsonb,jsonb,timestamptz),public.void_list_invitation(uuid,uuid,text),public.void_list_social(uuid),public.void_list_complete(uuid,text,text,boolean),public.void_list_inbox() from public,anon,authenticated;
grant execute on function public.void_list_write_v3(uuid,jsonb,jsonb,timestamptz),public.void_list_invitation(uuid,uuid,text),public.void_list_social(uuid),public.void_list_complete(uuid,text,text,boolean),public.void_list_inbox() to authenticated;
create function void_private.list_invite_people(target uuid,term text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.lists where id=target and owner_id=auth.uid() and collaboration_enabled) then raise insufficient_privilege;end if;
 if length(btrim(term)) not between 2 and 50 then raise exception 'INVALID_QUERY';end if;
 perform void_private.list_limit('list_action');
 return (select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from(select user_id,display_name,username,avatar_url from public.void_community_profiles where user_id<>auth.uid() and username is not null and username !~ '^void_' and (strpos(lower(display_name),lower(btrim(term)))>0 or strpos(username,lower(btrim(term)))=1) order by username limit 20)p);
end;$$;
revoke all on function void_private.list_invite_people(uuid,text) from public,anon,authenticated;
grant execute on function void_private.list_invite_people(uuid,text) to authenticated;
create function public.void_list_invite_people(target uuid,term text) returns jsonb language sql security invoker set search_path='' as $$select void_private.list_invite_people(target,term);$$;
revoke all on function public.void_list_invite_people(uuid,text) from public,anon,authenticated;
grant execute on function public.void_list_invite_people(uuid,text) to authenticated;
do $$declare name text;begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach name in array array['lists','list_items','list_members','list_progress'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=name) then execute format('alter publication supabase_realtime add table public.%I',name);end if;
  end loop;
 end if;
end;$$;
notify pgrst,'reload schema';
commit;
