begin;

-- Reuse the existing consumption date; never rewrite historical review payloads.
create function void_private.profile_consumed_on(value jsonb,created timestamptz) returns date
language plpgsql stable set search_path='' as $$
declare candidate text:=value->>'data';parsed date;
begin
 if candidate ~ '^\d{4}-\d{2}-\d{2}$' then
  begin parsed:=candidate::date;return parsed;exception when datetime_field_overflow or invalid_datetime_format then null;end;
 end if;
 return (created at time zone 'America/Sao_Paulo')::date;
end;$$;
revoke all on function void_private.profile_consumed_on(jsonb,timestamptz) from public;
grant execute on function void_private.profile_consumed_on(jsonb,timestamptz) to anon,authenticated;

create view public.void_profile_diary with(security_invoker=true) as
 select user_id,item_key,void_private.profile_consumed_on(payload,created_at) consumed_on,created_at,payload
 from public.void_records where kind='review' and payload is not null and void_private.can_view_profile(user_id);
revoke all on public.void_profile_diary from public,anon,authenticated;
grant select on public.void_profile_diary to anon,authenticated;

create function public.void_profile_diary_page(target uuid,activity_year integer,page_offset integer default 0) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if activity_year not between 1900 and 9999 or page_offset<0 or page_offset>1000000 then raise exception 'INVALID_QUERY';end if;
 return (with entries as materialized(select * from public.void_profile_diary where user_id=target),
 selected as materialized(select * from entries where consumed_on>=make_date(activity_year,1,1) and consumed_on<make_date(activity_year,12,31)+1)
 select jsonb_build_object('total',(select count(*) from selected),
 'years',coalesce((select jsonb_agg(y order by y desc) from(select distinct extract(year from consumed_on)::int y from entries)t),'[]'::jsonb),
 'days',coalesce((select jsonb_agg(jsonb_build_object('day',activity_day,'total',total) order by activity_day) from(select consumed_on activity_day,count(*) total from selected group by consumed_on)t),'[]'::jsonb),
 'rows',coalesce((select jsonb_agg(t order by consumed_on desc,created_at desc,item_key) from(select item_key,consumed_on,created_at,payload from selected order by consumed_on desc,created_at desc,item_key limit 30 offset page_offset)t),'[]'::jsonb)));
end;$$;
revoke all on function public.void_profile_diary_page(uuid,integer,integer) from public;
grant execute on function public.void_profile_diary_page(uuid,integer,integer) to anon,authenticated;

-- Extension point for authoritative server events. No client inserts/updates.
create table public.profile_activity_events(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,
 type text not null check(type ~ '^[a-z_]{1,40}$'),entity_id text not null check(length(entity_id) between 1 and 160),
 data jsonb not null default '{}' check(jsonb_typeof(data)='object' and pg_column_size(data)<=6000),
 is_public boolean not null default false,created_at timestamptz not null default now(),unique(user_id,type,entity_id)
);
alter table public.profile_activity_events enable row level security;
revoke all on public.profile_activity_events from public,anon,authenticated;
grant select on public.profile_activity_events to anon,authenticated;
grant select,insert,update,delete on public.profile_activity_events to service_role;
create policy activity_read on public.profile_activity_events for select to anon,authenticated
 using(void_private.can_view_profile(user_id) and (user_id=(select auth.uid()) or is_public));
create index profile_activity_recent on public.profile_activity_events(user_id,created_at desc,id);
create function void_private.record_profile_event(owner_id uuid,event_type text,event_entity text,event_data jsonb default '{}',public_event boolean default false)
returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
 insert into public.profile_activity_events(user_id,type,entity_id,data,is_public) values(owner_id,event_type,event_entity,event_data,public_event)
 on conflict(user_id,type,entity_id) do update set data=excluded.data,is_public=excluded.is_public returning id into result;
 return result;
end;$$;
revoke all on function void_private.record_profile_event(uuid,text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function void_private.record_profile_event(uuid,text,text,jsonb,boolean) to service_role;
grant usage on schema void_private to service_role;

create view public.void_profile_events with(security_invoker=true) as
 select user_id,'review:'||item_key event_key,'review'::text type,created_at occurred_at,
 jsonb_build_object('item_key',item_key,'item',payload->'item','rating',payload->'nota') data
 from public.void_records where kind='review' and payload is not null and void_private.can_view_profile(user_id)
 union all
 select l.owner_id,'list:'||i.list_id||':'||i.media_type||':'||i.external_id,'list_add',i.added_at,
 jsonb_build_object('list_id',l.id,'list_title',l.title,'item',i.snapshot)
 from public.list_items i join public.lists l on l.id=i.list_id where void_private.can_view_profile(l.owner_id)
 union all
 select r.user_id,'watchlist:'||r.item_key,'list_add',r.created_at,
 jsonb_build_object('list_id',l.id,'list_title',coalesce(l.title,'Ver depois'),'item',r.payload->'item','default_list',true)
 from public.void_records r left join public.lists l on l.owner_id=r.user_id and l.source_key='watchlist'
 where r.kind='watchlist' and r.payload is not null and void_private.can_view_profile(r.user_id)
 union all
 select follower_id,'follow:'||followed_id,'follow',created_at,jsonb_build_object('profile_id',followed_id)
 from public.follows where void_private.can_view_profile(follower_id)
 union all
 select user_id,'event:'||id,type,created_at,data||jsonb_build_object('event_id',id)
 from public.profile_activity_events;
revoke all on public.void_profile_events from public,anon,authenticated;
grant select on public.void_profile_events to anon,authenticated;

create function public.void_profile_activity_page(target uuid,page_offset integer default 0) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if page_offset<0 or page_offset>1000000 then raise exception 'INVALID_QUERY';end if;
 return (with events as materialized(select * from public.void_profile_events where user_id=target)
 select jsonb_build_object('total',(select count(*) from events),'rows',coalesce((select jsonb_agg(t order by occurred_at desc,event_key) from(select event_key,type,occurred_at,data from events order by occurred_at desc,event_key limit 30 offset page_offset)t),'[]'::jsonb)));
end;$$;
revoke all on function public.void_profile_activity_page(uuid,integer) from public;
grant execute on function public.void_profile_activity_page(uuid,integer) to anon,authenticated;

create table public.profile_comments(
 id uuid primary key default gen_random_uuid(),profile_id uuid not null references auth.users on delete cascade,
 user_id uuid not null references auth.users on delete cascade,body text not null check(length(trim(body)) between 1 and 500),
 created_at timestamptz not null default now()
);
alter table public.profile_comments enable row level security;
revoke all on public.profile_comments from public,anon,authenticated;
grant select on public.profile_comments to anon,authenticated;
grant insert(profile_id,user_id,body),delete on public.profile_comments to authenticated;
create policy wall_read on public.profile_comments for select to anon,authenticated
 using(void_private.can_view_profile(profile_id) or user_id=(select auth.uid()));
create policy wall_insert on public.profile_comments for insert to authenticated
 with check(user_id=(select auth.uid()) and void_private.can_view_profile(profile_id));
create policy wall_delete on public.profile_comments for delete to authenticated
 using(user_id=(select auth.uid()) or profile_id=(select auth.uid()));
create index profile_comments_recent on public.profile_comments(profile_id,created_at desc,id);
create index profile_comments_author on public.profile_comments(user_id);
create function void_private.profile_wall_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare hits integer;bucket timestamptz:=date_trunc('minute',clock_timestamp());
begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise insufficient_privilege;end if;
 new.body:=trim(new.body);new.created_at:=clock_timestamp();
 delete from void_private.identity_limits where window_start<bucket-interval '2 minutes';
 insert into void_private.identity_limits(actor,window_start,total) values('profile_wall:'||auth.uid(),bucket,1)
 on conflict(actor,window_start) do update set total=identity_limits.total+1 returning total into hits;
 if hits>5 then raise exception 'RATE_LIMIT';end if;
 return new;
end;$$;
revoke all on function void_private.profile_wall_guard() from public,anon,authenticated;
create trigger wall_guard before insert on public.profile_comments for each row execute function void_private.profile_wall_guard();
create trigger wall_username_guard before insert on public.profile_comments for each row execute function void_private.require_username();

-- Reference current authorized entities instead of caching private snapshots.
create view public.void_profile_highlight_options with(security_invoker=true) as
 select user_id,'review'::text kind,item_key entity_id,payload->'item' item,
 jsonb_build_object('rating',payload->'nota','has_review',length(trim(coalesce(payload->>'texto','')))>0) data,created_at
 from public.void_records where kind='review' and payload is not null and void_private.can_view_profile(user_id)
 union all
 select owner_id,'list',id::text,jsonb_build_object('titulo',title),jsonb_build_object('list_id',id),created_at
 from public.lists where void_private.can_view_profile(owner_id)
 union all
 select user_id,'achievement',id::text,jsonb_build_object('titulo',data->>'title'),data,created_at
 from public.profile_activity_events where type='achievement';
revoke all on public.void_profile_highlight_options from public,anon,authenticated;
grant select on public.void_profile_highlight_options to anon,authenticated;
create table public.profile_highlights(
 user_id uuid not null references auth.users on delete cascade,slot smallint not null check(slot between 1 and 3),
 kind text not null check(kind in('review','list','achievement')),entity_id text not null check(length(entity_id) between 1 and 160),
 primary key(user_id,slot),unique(user_id,kind,entity_id)
);
alter table public.profile_highlights enable row level security;
revoke all on public.profile_highlights from public,anon,authenticated;
grant select on public.profile_highlights to anon,authenticated;
grant insert,update,delete on public.profile_highlights to authenticated;
create policy highlights_read on public.profile_highlights for select to anon,authenticated using(
 user_id=(select auth.uid()) or (void_private.can_view_profile(user_id) and exists(select 1 from public.void_profile_highlight_options o where o.user_id=profile_highlights.user_id and o.kind=profile_highlights.kind and o.entity_id=profile_highlights.entity_id)));
create policy highlights_insert on public.profile_highlights for insert to authenticated with check(user_id=(select auth.uid()));
create policy highlights_update on public.profile_highlights for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy highlights_delete on public.profile_highlights for delete to authenticated using(user_id=(select auth.uid()));
create function void_private.profile_highlight_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise insufficient_privilege;end if;
 if not exists(select 1 from public.void_profile_highlight_options o where o.user_id=new.user_id and o.kind=new.kind and o.entity_id=new.entity_id) then raise exception 'INVALID_HIGHLIGHT';end if;
 return new;
end;$$;
revoke all on function void_private.profile_highlight_guard() from public,anon,authenticated;
create trigger highlight_guard before insert or update on public.profile_highlights for each row execute function void_private.profile_highlight_guard();
create trigger highlight_username_guard before insert or update on public.profile_highlights for each row execute function void_private.require_username();
create function public.void_profile_highlights(target uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('slot',h.slot,'kind',h.kind,'entity_id',h.entity_id,'item',o.item,'data',o.data) order by h.slot),'[]'::jsonb)
 from public.profile_highlights h join public.void_profile_highlight_options o using(user_id,kind,entity_id) where h.user_id=target;
$$;
revoke all on function public.void_profile_highlights(uuid) from public;
grant execute on function public.void_profile_highlights(uuid) to anon,authenticated;
commit;
