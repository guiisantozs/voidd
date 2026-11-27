begin;

create table public.notification_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 friend_request boolean not null default true, friend_accepted boolean not null default true,
 follower boolean not null default true, review_like boolean not null default true,
 review_comment boolean not null default true, mention boolean not null default true,
 achievement boolean not null default true, watchlist_review boolean not null default true
);
alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from public,anon,authenticated;
grant select,insert,update on public.notification_preferences to authenticated;
create policy preferences_read on public.notification_preferences for select to authenticated using(user_id=(select auth.uid()));
create policy preferences_insert on public.notification_preferences for insert to authenticated with check(user_id=(select auth.uid()));
create policy preferences_update on public.notification_preferences for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

create table public.notifications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete cascade,
 type text not null check(type in('friend_request','friend_accepted','follower','review_like','review_comment','mention','achievement','watchlist_review')),
 entity_type text not null check(entity_type in('profile','review','achievement')),
 entity_id text not null, data jsonb not null default '{}',
 read_at timestamptz, created_at timestamptz not null default now()
);
create index notifications_inbox on public.notifications(user_id,read_at,created_at desc);
create index notifications_page on public.notifications(user_id,created_at desc,id desc);
create index notifications_expiry on public.notifications(created_at);
create index notifications_actor on public.notifications(actor_id);
create index notifications_entity on public.notifications(entity_id,type,actor_id);
create index notifications_comment on public.notifications((data->>'comment_id'));
create index notification_watchlist_lookup on public.void_records(item_key,user_id) where kind='watchlist' and payload is not null;
alter table public.notifications enable row level security;
revoke all on public.notifications from public,anon,authenticated;
grant select,delete on public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;

-- Keep deduplication independent of user deletion/read state and undone actions.
create table void_private.notification_events (
 user_id uuid not null references auth.users(id) on delete cascade,
 event_key text not null, created_at timestamptz not null default now(),primary key(user_id,event_key)
);
create index notification_events_expiry on void_private.notification_events(created_at);
alter table void_private.notification_events enable row level security;
revoke all on void_private.notification_events from public,anon,authenticated;

-- Explicit viewer: triggers must check the recipient, not the acting auth.uid().
create function void_private.notification_profile_access(owner_id uuid,viewer uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select owner_id=viewer or exists(select 1 from public.void_community_profiles p where p.user_id=owner_id
 and (p.visibility='public' or (p.visibility='followers' and exists(select 1 from public.follows f where f.follower_id=viewer and f.followed_id=owner_id))));
$$;
revoke all on function void_private.notification_profile_access(uuid,uuid) from public,anon,authenticated;

create function void_private.notification_visible(n public.notifications) returns boolean
language sql stable security definer set search_path='' as $$
 select n.user_id=auth.uid() and n.created_at>=now()-interval '90 days' and
 case when n.entity_type='review' then exists(
  select 1 from public.void_records r where r.user_id=(n.data->>'review_user')::uuid
   and r.kind='review' and r.item_key=n.data->>'item_key' and r.payload is not null
   and (r.user_id=n.user_id or (r.is_public and void_private.notification_profile_access(r.user_id,n.user_id)))
   and (not(n.data ? 'comment_id') or exists(select 1 from public.void_review_comments c where c.id=(n.data->>'comment_id')::uuid))
 ) else true end;
$$;
revoke all on function void_private.notification_visible(public.notifications) from public,anon,authenticated;
grant execute on function void_private.notification_visible(public.notifications) to authenticated;
create policy notifications_read on public.notifications for select to authenticated using(user_id=(select auth.uid()) and void_private.notification_visible(notifications));
create policy notifications_update on public.notifications for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated using(user_id=(select auth.uid()));

create function void_private.notify(recipient uuid,actor uuid,kind text,entity text,entity_key text,details jsonb,dedup text) returns void
language plpgsql security definer set search_path='' as $$
declare person public.void_community_profiles;
begin
 if recipient is null or recipient=actor then return;end if;
 if not exists(select 1 from auth.users where id=recipient) then return;end if;
 if exists(select 1 from public.notification_preferences p where p.user_id=recipient and (to_jsonb(p)->>kind)::boolean=false) then return;end if;
 if entity='review' and not exists(select 1 from public.void_records r where r.user_id=(details->>'review_user')::uuid and r.item_key=details->>'item_key' and r.kind='review' and r.payload is not null and (r.user_id=recipient or (r.is_public and void_private.notification_profile_access(r.user_id,recipient)))) then return;end if;
 select * into person from public.void_community_profiles where user_id=actor;
 insert into void_private.notification_events(user_id,event_key) values(recipient,dedup) on conflict do nothing;
 if not found then return;end if;
 insert into public.notifications(user_id,actor_id,type,entity_type,entity_id,data)
 values(recipient,actor,kind,entity,entity_key,details||jsonb_build_object('actor_name',coalesce(person.display_name,'Pessoa do Void'),'avatar_url',person.avatar_url));
end;$$;
revoke all on function void_private.notify(uuid,uuid,text,text,text,jsonb,text) from public,anon,authenticated;

create function void_private.notification_social() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='follows' then
  if tg_op='DELETE' then
   delete from public.notifications where user_id=old.followed_id and actor_id=old.follower_id and type='follower';return old;
  end if;
  perform void_private.notify(new.followed_id,new.follower_id,'follower','profile',new.follower_id::text,'{}','follow:'||new.follower_id);
 else
  if tg_op='DELETE' then
   delete from public.notifications where type in('friend_request','friend_accepted') and ((user_id=old.recipient and actor_id=old.sender) or (user_id=old.sender and actor_id=old.recipient));return old;
  end if;
  if tg_op='INSERT' and new.status='pending' then
   perform void_private.notify(new.recipient,new.sender,'friend_request','profile',new.sender::text,'{}','invite:'||new.sender);
  elsif tg_op='UPDATE' and old.status='pending' and new.status='accepted' then
   delete from public.notifications where user_id=new.recipient and actor_id=new.sender and type='friend_request';
   perform void_private.notify(new.sender,new.recipient,'friend_accepted','profile',new.recipient::text,'{}','accepted:'||new.recipient);
  end if;
 end if;return new;
end;$$;
revoke all on function void_private.notification_social() from public,anon,authenticated;
create trigger notification_follows after insert or delete on public.follows for each row execute function void_private.notification_social();
create trigger notification_friendships after insert or update or delete on public.void_friendships for each row execute function void_private.notification_social();

create function void_private.notification_review() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid;owner_id uuid;item text;source_text text;details jsonb;review_payload jsonb;target uuid;handle text;event_id text;event_kind text;
begin
 if tg_table_name='void_records' then
  if tg_op='DELETE' then
   if old.kind='review' then delete from public.notifications where entity_id=old.user_id||'/'||old.item_key;end if;return old;
  end if;
  if new.kind<>'review' then return new;end if;
  if new.payload is null then delete from public.notifications where entity_id=new.user_id||'/'||new.item_key;return new;end if;
  actor:=new.user_id;owner_id:=new.user_id;item:=new.item_key;review_payload:=new.payload;source_text:=new.payload->>'texto';event_id:='review:'||actor||':'||item;
 else
  if tg_op='DELETE' then
   if tg_table_name='void_review_likes' then
    delete from public.notifications where type='review_like' and actor_id=old.user_id and entity_id=old.review_user||'/'||old.item_key;
   else delete from public.notifications where data->>'comment_id'=old.id::text;end if;return old;
  end if;
  actor:=new.user_id;owner_id:=new.review_user;item:=new.item_key;
  select payload into review_payload from public.void_records where user_id=owner_id and kind='review' and item_key=item;
  if tg_table_name='void_review_comments' then source_text:=new.body;event_id:='comment:'||new.id;event_kind:='review_comment';
  else event_id:='like:'||actor||':'||owner_id||':'||item;event_kind:='review_like';end if;
 end if;
 details:=jsonb_build_object('review_user',owner_id,'item_key',item,'title',left(review_payload->'item'->>'titulo',180),'poster',review_payload->'item'->>'poster');
 if tg_table_name='void_review_comments' then details:=details||jsonb_build_object('comment_id',new.id);end if;
 if event_kind is not null then perform void_private.notify(owner_id,actor,event_kind,'review',owner_id||'/'||item,details,event_id);end if;
 for handle in select distinct lower(m[2]) from regexp_matches(coalesce(source_text,''),'(^|[^a-zA-Z0-9_@])@([a-zA-Z0-9_]{3,40})','g') m loop
  select user_id into target from public.void_community_profiles where username=handle;
  perform void_private.notify(target,actor,'mention','review',owner_id||'/'||item,details,event_id||':mention:'||handle);
 end loop;
 if tg_table_name='void_records' and item like 'filmes:%' then
  -- Membership is private to each recipient; no list title/membership enters data.
  for target in select w.user_id from public.void_records w where w.kind='watchlist' and w.item_key=split_part(item,':',2) and w.payload is not null and w.user_id<>actor and
   (exists(select 1 from public.void_friendships f where f.status='accepted' and ((f.sender=actor and f.recipient=w.user_id) or (f.recipient=actor and f.sender=w.user_id)))
    or (exists(select 1 from public.follows where follower_id=actor and followed_id=w.user_id) and exists(select 1 from public.follows where follower_id=w.user_id and followed_id=actor))) loop
   perform void_private.notify(target,actor,'watchlist_review','review',owner_id||'/'||item,details,event_id||':watchlist');
  end loop;
 end if;
 return new;
end;$$;
revoke all on function void_private.notification_review() from public,anon,authenticated;
create trigger notification_reviews after insert or update or delete on public.void_records for each row execute function void_private.notification_review();
create trigger notification_likes after insert or delete on public.void_review_likes for each row execute function void_private.notification_review();
create trigger notification_comments after insert or delete on public.void_review_comments for each row execute function void_private.notification_review();

-- Simplest retention for this stack: indexed cleanup on insertion, no cron extension.
create function void_private.notification_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 delete from public.notifications where created_at<now()-interval '90 days';
 delete from void_private.notification_events where created_at<now()-interval '90 days';
 return null;
end;$$;
revoke all on function void_private.notification_cleanup() from public,anon,authenticated;
create trigger notification_retention after insert on public.notifications for each statement execute function void_private.notification_cleanup();

-- Existing pending invitations remain actionable: seed the inbox once without
-- replaying old likes/follows/reviews or changing the friendship itself.
do $$declare invitation record;begin
 for invitation in select sender,recipient from public.void_friendships where status='pending' loop
  perform void_private.notify(invitation.recipient,invitation.sender,'friend_request','profile',invitation.sender::text,'{}','invite:'||invitation.sender);
 end loop;
end$$;

-- Resolve deep links through the existing record/profile RLS, including private
-- reviews owned by the caller. Never use the public share-card endpoint here.
create function public.void_notification_review(author_id uuid,movie_key text) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('user_id',r.user_id,'text',coalesce(r.payload->>'texto',''),
  'rating',(r.payload->>'nota')::numeric,'spoiler',coalesce((r.payload->>'spoiler')::boolean,false),
  'updated_at',r.updated_at,'rewatched',coalesce((r.payload->>'revi')::boolean,false),
  'likes',(select count(*) from public.void_review_likes k where k.review_user=r.user_id and k.item_key=r.item_key),
  'liked',exists(select 1 from public.void_review_likes k where k.review_user=r.user_id and k.item_key=r.item_key and k.user_id=auth.uid()),
  'comments',(select count(*) from public.void_review_comments c where c.review_user=r.user_id and c.item_key=r.item_key))
 from public.void_records r where r.user_id=author_id and r.kind='review' and r.item_key=movie_key and r.payload is not null;
$$;
revoke all on function public.void_notification_review(uuid,text) from public,anon,authenticated;
grant execute on function public.void_notification_review(uuid,text) to authenticated;

do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.notifications;
  -- Reuse friendship state for the pending counter, including withdrawn invites.
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='void_friendships') then alter publication supabase_realtime add table public.void_friendships;end if;
 end if;
end$$;
commit;
