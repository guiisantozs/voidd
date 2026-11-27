begin;
-- Additive social features. Existing reviews, collection and list progress are untouched.
create table public.user_blocks(
 blocker_id uuid not null references auth.users on delete cascade,
 blocked_id uuid not null references auth.users on delete cascade,
 created_at timestamptz not null default now(),primary key(blocker_id,blocked_id),check(blocker_id<>blocked_id)
);
create index user_blocks_reverse on public.user_blocks(blocked_id,blocker_id);
alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from public,anon,authenticated;
grant select,insert,delete on public.user_blocks to authenticated;
create policy blocks_read on public.user_blocks for select to authenticated using(blocker_id=(select auth.uid()));
create policy blocks_add on public.user_blocks for insert to authenticated with check(blocker_id=(select auth.uid()));
create policy blocks_remove on public.user_blocks for delete to authenticated using(blocker_id=(select auth.uid()));
create function public.void_blocked_people() returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('blocked_id',b.blocked_id,'display_name',p.display_name,'username',p.username)),'[]'::jsonb) from public.user_blocks b left join public.void_community_profiles p on p.user_id=b.blocked_id where b.blocker_id=(select auth.uid());
$$;
revoke all on function public.void_blocked_people() from public,anon,authenticated;
grant execute on function public.void_blocked_people() to authenticated;

-- The caller can test only their own relationship, never a third-party block graph.
create function void_private.social_blocked(person uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is null or exists(select 1 from public.user_blocks where (blocker_id=auth.uid() and blocked_id=person) or (blocked_id=auth.uid() and blocker_id=person));
$$;
revoke all on function void_private.social_blocked(uuid) from public,anon,authenticated;
grant execute on function void_private.social_blocked(uuid) to authenticated;
create policy friends_unblocked_insert on public.void_friendships as restrictive for insert to authenticated with check(not void_private.social_blocked(case when sender=(select auth.uid()) then recipient else sender end));
create policy friends_unblocked_update on public.void_friendships as restrictive for update to authenticated using(not void_private.social_blocked(case when sender=(select auth.uid()) then recipient else sender end)) with check(not void_private.social_blocked(case when sender=(select auth.uid()) then recipient else sender end));
create policy follows_unblocked on public.follows as restrictive for insert to authenticated with check(not void_private.social_blocked(followed_id));

-- Keep the existing friendship definition (accepted invitations or mutual follows).
create function void_private.social_friend(person uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and person<>auth.uid() and not void_private.social_blocked(person) and (
 exists(select 1 from public.void_friendships where status='accepted' and ((sender=auth.uid() and recipient=person) or (recipient=auth.uid() and sender=person)))
 or (exists(select 1 from public.follows where follower_id=auth.uid() and followed_id=person) and exists(select 1 from public.follows where follower_id=person and followed_id=auth.uid())));
$$;
revoke all on function void_private.social_friend(uuid) from public,anon,authenticated;
grant execute on function void_private.social_friend(uuid) to authenticated;

create function void_private.social_block_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 delete from public.void_friendships where (sender=new.blocker_id and recipient=new.blocked_id) or (recipient=new.blocker_id and sender=new.blocked_id);
 delete from public.follows where (follower_id=new.blocker_id and followed_id=new.blocked_id) or (followed_id=new.blocker_id and follower_id=new.blocked_id);
 update public.list_members m set status='removed',responded_at=now() from public.lists l where l.id=m.list_id and ((l.owner_id=new.blocker_id and m.user_id=new.blocked_id) or (l.owner_id=new.blocked_id and m.user_id=new.blocker_id));
 return new;
end;$$;
revoke all on function void_private.social_block_cleanup() from public,anon,authenticated;
create trigger social_block_cleanup after insert on public.user_blocks for each row execute function void_private.social_block_cleanup();

-- Preserve nominal invitation behavior and quotas; check blocks for old clients too.
alter function void_private.list_invitation(uuid,uuid,text) rename to list_invitation_base;
revoke all on function void_private.list_invitation_base(uuid,uuid,text) from public,anon,authenticated;
create function void_private.list_invitation(target uuid,person uuid,action text) returns void language plpgsql security definer set search_path='' as $$
declare other uuid;
begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 select case when owner_id=auth.uid() then person else owner_id end into other from public.lists where id=target;
 if action in('invite','accept') and void_private.social_blocked(other) then raise insufficient_privilege;end if;
 perform void_private.list_invitation_base(target,person,action);
end;$$;
revoke all on function void_private.list_invitation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function void_private.list_invitation(uuid,uuid,text) to authenticated;
-- Rebind the public wrapper after renaming the implementation.
create or replace function public.void_list_invitation(target uuid,person uuid,action text) returns void language sql security invoker set search_path='' as $$select void_private.list_invitation(target,person,action);$$;

create table public.list_invite_links(
 list_id uuid primary key references public.lists on delete cascade,
 token text not null unique check(token ~ '^[a-f0-9]{64}$'),enabled boolean not null default true,updated_at timestamptz not null default now()
);
alter table public.list_invite_links enable row level security;
revoke all on public.list_invite_links from public,anon,authenticated;
grant select on public.list_invite_links to authenticated;
create policy link_owner on public.list_invite_links for select to authenticated using(exists(select 1 from public.lists l where l.id=list_id and l.owner_id=(select auth.uid())));
create function void_private.social_list_link(target uuid,action text) returns jsonb language plpgsql security definer set search_path='' as $$
declare link public.list_invite_links;
begin
 if auth.uid() is null or not exists(select 1 from public.lists where id=target and owner_id=auth.uid() and collaboration_enabled and source_key is null for update) then raise insufficient_privilege;end if;
 perform void_private.list_limit('list_action');
 if action not in('get','rotate','disable') or action is null then raise exception 'INVALID_ACTION';end if;
 select * into link from public.list_invite_links where list_id=target;
 if action='disable' then update public.list_invite_links set enabled=false,updated_at=now() where list_id=target;
 elsif action='rotate' or not found then
  insert into public.list_invite_links(list_id,token) values(target,replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','')) on conflict(list_id) do update set token=excluded.token,enabled=true,updated_at=now();
 end if;
 select * into link from public.list_invite_links where list_id=target;
 return jsonb_build_object('token',case when link.enabled then link.token end,'enabled',coalesce(link.enabled,false));
end;$$;
create function void_private.social_link_disable() returns trigger language plpgsql security definer set search_path='' as $$begin
 if not new.collaboration_enabled then update public.list_invite_links set enabled=false where list_id=new.id;end if;return new;
end;$$;
revoke all on function void_private.social_link_disable() from public,anon,authenticated;
create trigger social_link_disable after update of collaboration_enabled on public.lists for each row execute function void_private.social_link_disable();
create function void_private.social_join_link(invite_token text,join_now boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.lists;member_status text;
begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 perform void_private.list_limit('list_action');
 if invite_token is null or invite_token !~ '^[a-f0-9]{64}$' or join_now is null then raise exception 'INVALID_INVITE';end if;
 select x.* into l from public.lists x join public.list_invite_links k on k.list_id=x.id where k.token=invite_token and k.enabled and x.collaboration_enabled and x.source_key is null for update of x;
 -- Recheck under the parent lock: rotations/disable serialize with joining.
 if not found or not exists(select 1 from public.list_invite_links where list_id=l.id and token=invite_token and enabled) or void_private.social_blocked(l.owner_id) then raise exception 'INVALID_INVITE';end if;
 select status into member_status from public.list_members where list_id=l.id and user_id=auth.uid();
 if member_status in('removed','declined') then raise exception 'INVALID_INVITE';end if;
 if join_now and auth.uid()<>l.owner_id and member_status is distinct from 'accepted' then
  perform void_private.require_social_identity();
  insert into public.list_members(list_id,user_id,status,responded_at,joined_at) values(l.id,auth.uid(),'accepted',now(),now()) on conflict(list_id,user_id) do update set status='accepted',responded_at=now(),joined_at=now();
  member_status:='accepted';
 end if;
 return jsonb_build_object('id',l.id,'title',l.title,'description',l.description,'visibility',l.visibility,'joined',auth.uid()=l.owner_id or member_status='accepted','owner',(select jsonb_build_object('user_id',p.user_id,'display_name',p.display_name,'username',p.username,'avatar_url',p.avatar_url,'avatar_id',p.avatar_id) from public.void_community_profiles p where p.user_id=l.owner_id));
end;$$;
create function void_private.require_social_identity() returns void language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or not exists(select 1 from public.void_community_profiles where user_id=auth.uid() and username is not null and username not like 'void\_%') then raise insufficient_privilege;end if;
end;$$;
revoke all on function void_private.require_social_identity() from public,anon,authenticated;

-- One paged identity lookup for invitations and recommendations, never private content.
create function void_private.social_people(target uuid,mode text,term text,page_number integer) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 if mode not in('friends','search') or mode is null or length(coalesce(term,''))>50 or page_number is null or page_number not between 0 and 1000 then raise exception 'INVALID_QUERY';end if;
 if target is not null and not exists(select 1 from public.lists where id=target and owner_id=auth.uid() and collaboration_enabled) then raise insufficient_privilege;end if;
 if mode='search' and (target is null or length(trim(term))<2) then return '[]'::jsonb;end if;
 perform void_private.list_limit('list_action');
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
  select p.user_id,p.display_name,p.username,p.avatar_url,p.avatar_id,m.status
  from public.void_community_profiles p left join public.list_members m on m.list_id=target and m.user_id=p.user_id
  where p.user_id<>auth.uid() and p.username not like 'void\_%' and not void_private.social_blocked(p.user_id)
  and (mode='search' or void_private.social_friend(p.user_id))
  and (trim(coalesce(term,''))='' or position(lower(trim(term)) in lower(p.username||' '||p.display_name))>0)
  order by p.display_name,p.user_id limit 21 offset page_number*20)x),'[]'::jsonb);
end;$$;

create table public.work_recommendations(
 id uuid primary key default gen_random_uuid(),sender_id uuid not null references auth.users on delete cascade,
 recipient_id uuid not null references auth.users on delete cascade,
 media_type text not null check(media_type in('filmes','series','jogos','animes')),
 external_id text not null check(external_id ~ '^[1-9][0-9]{0,14}$'),snapshot jsonb not null,
 message text not null default '' check(length(message)<=500),created_at timestamptz not null default now(),
 check(sender_id<>recipient_id),unique(sender_id,recipient_id,media_type,external_id),
 check((snapshot->>'id'=external_id and snapshot->>'categoria'=media_type and length(snapshot->>'titulo') between 1 and 200 and octet_length(snapshot::text)<=6000) is true)
);
create index work_recommendations_inbox on public.work_recommendations(recipient_id,media_type,external_id,created_at desc);
alter table public.work_recommendations enable row level security;
revoke all on public.work_recommendations from public,anon,authenticated;
grant select on public.work_recommendations to authenticated;
create policy recommendations_own on public.work_recommendations for select to authenticated using(recipient_id=(select auth.uid()) and void_private.social_friend(sender_id));
alter table public.notification_preferences add column work_recommendation boolean not null default true;
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check(type in('friend_request','friend_accepted','follower','review_like','review_comment','mention','achievement','watchlist_review','list_invite','friend_game_review','work_recommendation'));
alter table public.notifications drop constraint notifications_entity_type_check;
alter table public.notifications add constraint notifications_entity_type_check check(entity_type in('profile','review','achievement','list','recommendation'));
create policy social_notifications_read on public.notifications as restrictive for select to authenticated using(
 (type<>'work_recommendation' or exists(select 1 from public.work_recommendations r where r.id::text=entity_id and r.recipient_id=(select auth.uid())))
 and (type<>'list_invite' or not void_private.social_blocked(actor_id))
);
create or replace function void_private.list_invite_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare l public.lists;
begin
 delete from public.notifications where user_id=new.user_id and type='list_invite' and entity_id=new.list_id::text;
 if new.status='pending' then
  select * into l from public.lists where id=new.list_id;
  perform void_private.notify(new.user_id,l.owner_id,'list_invite','list',l.id::text,jsonb_build_object('title',l.title,'actor_username',(select username from public.void_community_profiles where user_id=l.owner_id)),'list-invite:'||l.id||':'||new.invited_at);
 end if;return new;
end;$$;
create function void_private.social_recommend(entry jsonb,recipients uuid[],note text) returns jsonb language plpgsql security definer set search_path='' as $$
declare person uuid;work jsonb;record_id uuid;sent integer:=0;used integer;title text;poster text;
begin
 perform void_private.require_social_identity();
 if recipients is null or cardinality(recipients) not between 1 and 20 or length(coalesce(note,''))>500 or entry is null or (entry->>'media_type') is null or entry->>'media_type' not in('filmes','series','jogos','animes') or (entry->>'external_id') is null or entry->>'external_id' !~ '^[1-9][0-9]{0,14}$' then raise exception 'INVALID_RECOMMENDATION';end if;
 title:=void_private.list_text(entry->'snapshot'->>'titulo');poster:=coalesce(entry->'snapshot'->>'poster','');
 if length(coalesce(title,'')) not between 1 and 200 or length(poster)>1000 or (poster<>'' and poster !~ '^https://[^[:space:]"<>\\]+$') or length(coalesce(entry->'snapshot'->>'ano',''))>20 then raise exception 'INVALID_ITEM';end if;
 work:=jsonb_build_object('id',entry->>'external_id','categoria',entry->>'media_type','titulo',title,'poster',poster,'ano',void_private.list_text(entry->'snapshot'->>'ano'));
 -- Serialize same-actor sends and block changes before checking relationships.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,43));
 foreach person in array recipients loop
  if person is null or not void_private.social_friend(person) then raise insufficient_privilege;end if;
 end loop;
 for person in select distinct unnest(recipients) loop
  insert into public.work_recommendations(sender_id,recipient_id,media_type,external_id,snapshot,message) values(auth.uid(),person,entry->>'media_type',entry->>'external_id',work,void_private.list_text(note)) on conflict do nothing returning id into record_id;
  if record_id is not null then
   insert into void_private.write_limits as w(user_id,action,bucket,n) values(auth.uid(),'work_recommendation',date_trunc('hour',clock_timestamp() at time zone 'UTC') at time zone 'UTC',1) on conflict(user_id,action) do update set bucket=excluded.bucket,n=case when w.bucket=excluded.bucket then w.n+1 else 1 end returning n into used;
   if used>40 then raise exception 'RATE_LIMIT';end if;
   perform void_private.notify(person,auth.uid(),'work_recommendation','recommendation',record_id::text,jsonb_build_object('work',work,'title',title,'message',void_private.list_text(note)),'recommendation:'||record_id);
   sent:=sent+1;
  end if;
 end loop;
 return jsonb_build_object('sent',sent);
end;$$;
create function public.void_work_recommendations(media text,external text) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'message',r.message,'created_at',r.created_at,'user_id',p.user_id,'display_name',p.display_name,'username',p.username,'avatar_url',p.avatar_url,'avatar_id',p.avatar_id) order by r.created_at desc),'[]'::jsonb)
 from public.work_recommendations r join public.void_community_profiles p on p.user_id=r.sender_id where r.recipient_id=(select auth.uid()) and r.media_type=media and r.external_id=external;
$$;

create table public.social_suggestion_history(
 user_id uuid not null references auth.users on delete cascade,person_id uuid not null references auth.users on delete cascade,
 shown_at timestamptz not null default now(),hidden boolean not null default false,primary key(user_id,person_id),check(user_id<>person_id)
);
alter table public.social_suggestion_history enable row level security;
revoke all on public.social_suggestion_history from public,anon,authenticated;
grant select on public.social_suggestion_history to authenticated;
create policy suggestions_own on public.social_suggestion_history for select to authenticated using(user_id=(select auth.uid()));
create function void_private.social_suggestions(dismiss uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform void_private.require_social_identity();
 perform void_private.list_limit('list_action');
 if dismiss is not null then
  insert into public.social_suggestion_history(user_id,person_id,hidden) values(auth.uid(),dismiss,true) on conflict(user_id,person_id) do update set hidden=true;
  return '[]'::jsonb;
 end if;
 -- Do not inspect third-party private friendships, libraries, Steam, or private reviews.
 -- Common connections use PUBLIC mutual follows between PUBLIC profiles only.
 with candidates as materialized (
  select p.* from public.void_community_profiles p where p.visibility='public' and p.user_id<>auth.uid() and p.username not like 'void\_%'
  and not void_private.social_blocked(p.user_id) and not void_private.social_friend(p.user_id)
  and not exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followed_id=p.user_id)
  and not exists(select 1 from public.void_friendships f where auth.uid() in(f.sender,f.recipient) and p.user_id in(f.sender,f.recipient))
  and not exists(select 1 from public.social_suggestion_history h where h.user_id=auth.uid() and h.person_id=p.user_id and (h.hidden or h.shown_at>now()-interval '3 days'))
 ), tastes as materialized (
  select r.user_id,r.item_key from public.void_records r join public.void_community_profiles p on p.user_id=r.user_id and p.visibility='public'
  where r.kind='review' and r.is_public and (r.payload->>'nota')::numeric>=3.5
  union select f.user_id,f.media_type||':'||f.external_id from public.profile_favorites f join public.void_community_profiles p on p.user_id=f.user_id and p.visibility='public'
 ), interests as materialized (
  select distinct r.user_id,split_part(r.item_key,':',1) media,lower(g.genre) genre
  from public.void_records r join public.void_community_profiles p on p.user_id=r.user_id and p.visibility='public'
  cross join lateral jsonb_array_elements_text(case when jsonb_typeof(r.payload->'item'->'generos')='array' then r.payload->'item'->'generos' else '[]'::jsonb end)g(genre)
  where r.kind='review' and r.is_public and (r.payload->>'nota')::numeric>=3.5 and length(g.genre) between 1 and 80
 ), ranked as (
  select p.user_id,p.display_name,p.username,p.avatar_url,p.avatar_id,
  (select count(*) from public.follows f join public.follows back on back.follower_id=f.followed_id and back.followed_id=f.follower_id join public.void_community_profiles cp on cp.user_id=f.followed_id and cp.visibility='public' where f.follower_id=p.user_id and void_private.social_friend(f.followed_id) and not void_private.social_blocked(f.followed_id)) common_friends,
  (select count(*) from tastes a join tastes b using(item_key) where a.user_id=auth.uid() and b.user_id=p.user_id) shared_tastes,
  (select count(*) from interests a join interests b using(media,genre) where a.user_id=auth.uid() and b.user_id=p.user_id) shared_interests,
  (select max(r.updated_at) from public.void_records r where r.user_id=p.user_id and r.kind='review' and r.is_public) active_at
  from candidates p
 ), chosen as (select * from ranked order by common_friends desc,shared_tastes desc,shared_interests desc,active_at desc nulls last,user_id limit 8)
 select coalesce(jsonb_agg(to_jsonb(c) order by common_friends desc,shared_tastes desc,shared_interests desc,active_at desc nulls last,user_id),'[]'::jsonb) into result from chosen c;
 insert into public.social_suggestion_history(user_id,person_id) select auth.uid(),(x->>'user_id')::uuid from jsonb_array_elements(result)x on conflict(user_id,person_id) do update set shown_at=now();
 return result;
end;$$;

-- Public RPCs stay invoker; private implementations always bind auth.uid().
create function public.void_social_people(target uuid default null,mode text default 'friends',term text default '',page_number integer default 0) returns jsonb language sql security invoker set search_path='' as $$select void_private.social_people(target,mode,term,page_number);$$;
create function public.void_list_link(target uuid,action text default 'get') returns jsonb language sql security invoker set search_path='' as $$select void_private.social_list_link(target,action);$$;
create function public.void_list_join_link(invite_token text,join_now boolean default false) returns jsonb language sql security invoker set search_path='' as $$select void_private.social_join_link(invite_token,join_now);$$;
create function public.void_recommend_work(entry jsonb,recipients uuid[],note text default '') returns jsonb language sql security invoker set search_path='' as $$select void_private.social_recommend(entry,recipients,note);$$;
create function public.void_social_suggestions(dismiss uuid default null) returns jsonb language sql security invoker set search_path='' as $$select void_private.social_suggestions(dismiss);$$;
revoke all on function void_private.social_list_link(uuid,text),void_private.social_join_link(text,boolean),void_private.social_people(uuid,text,text,integer),void_private.social_recommend(jsonb,uuid[],text),void_private.social_suggestions(uuid),public.void_social_people(uuid,text,text,integer),public.void_list_link(uuid,text),public.void_list_join_link(text,boolean),public.void_recommend_work(jsonb,uuid[],text),public.void_work_recommendations(text,text),public.void_social_suggestions(uuid) from public,anon,authenticated;
grant execute on function void_private.social_list_link(uuid,text),void_private.social_join_link(text,boolean),void_private.social_people(uuid,text,text,integer),void_private.social_recommend(jsonb,uuid[],text),void_private.social_suggestions(uuid),public.void_social_people(uuid,text,text,integer),public.void_list_link(uuid,text),public.void_list_join_link(text,boolean),public.void_recommend_work(jsonb,uuid[],text),public.void_work_recommendations(text,text),public.void_social_suggestions(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
