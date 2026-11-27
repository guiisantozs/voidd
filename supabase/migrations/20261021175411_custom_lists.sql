begin;
create table public.lists(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(title) between 1 and 80),description text not null default '' check(length(description)<=500),
 visibility text not null default 'private' check(visibility in('public','connections','private')),ranked boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index lists_owner_recent on public.lists(owner_id,updated_at desc,id);
create index lists_recent on public.lists(updated_at desc,id);
create table public.list_items(
 list_id uuid not null references public.lists(id) on delete cascade,
 media_type text not null check(media_type in('filmes','series','jogos','animes')),
 external_id text not null check(external_id ~ '^[1-9][0-9]{0,14}$'),
 position smallint not null check(position between 0 and 199),note text not null default '' check(length(note)<=200),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object' and pg_column_size(snapshot)<=6000),added_at timestamptz not null default now(),
 primary key(list_id,media_type,external_id),unique(list_id,position) deferrable initially deferred
);
create table public.list_likes(list_id uuid not null references public.lists(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,created_at timestamptz not null default now(),primary key(list_id,user_id));
create table public.list_saves(list_id uuid not null references public.lists(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,created_at timestamptz not null default now(),primary key(list_id,user_id));
create index list_likes_user on public.list_likes(user_id,list_id);
create index list_saves_user on public.list_saves(user_id,created_at desc,list_id);

-- Minimal authorization helper: no list bodies or profile fields escape here.
create function void_private.list_visible(owner uuid,access text) returns boolean language sql stable security definer set search_path='' as $$
 select owner=auth.uid() or (void_private.can_view_profile(owner) and
 (access='public' or access='connections' and auth.uid() is not null and
 (exists(select 1 from public.follows where follower_id=auth.uid() and followed_id=owner) or owner=any(public.void_detail_friend_ids()))));
$$;
revoke all on function void_private.list_visible(uuid,text) from public,anon,authenticated;
grant execute on function void_private.list_visible(uuid,text) to anon,authenticated;
alter table public.lists enable row level security;
alter table public.list_items enable row level security;
alter table public.list_likes enable row level security;
alter table public.list_saves enable row level security;
revoke all on public.lists,public.list_items,public.list_likes,public.list_saves from public,anon,authenticated;
grant select on public.lists,public.list_items,public.list_likes to anon,authenticated;
grant select on public.list_saves to authenticated;
grant insert,update,delete on public.lists,public.list_items to authenticated;
grant insert,delete on public.list_likes,public.list_saves to authenticated;
create policy lists_read on public.lists for select to anon,authenticated using(void_private.list_visible(owner_id,visibility));
create policy lists_create on public.lists for insert to authenticated with check(owner_id=(select auth.uid()));
create policy lists_edit on public.lists for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy lists_remove on public.lists for delete to authenticated using(owner_id=(select auth.uid()));
create policy items_read on public.list_items for select to anon,authenticated using(exists(select 1 from public.lists l where l.id=list_id));
create policy items_create on public.list_items for insert to authenticated with check(exists(select 1 from public.lists l where l.id=list_id and l.owner_id=(select auth.uid())));
create policy items_edit on public.list_items for update to authenticated using(exists(select 1 from public.lists l where l.id=list_id and l.owner_id=(select auth.uid()))) with check(exists(select 1 from public.lists l where l.id=list_id and l.owner_id=(select auth.uid())));
create policy items_remove on public.list_items for delete to authenticated using(exists(select 1 from public.lists l where l.id=list_id and l.owner_id=(select auth.uid())));
create policy list_likes_read on public.list_likes for select to anon,authenticated using(exists(select 1 from public.lists l where l.id=list_id));
create policy list_likes_create on public.list_likes for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.lists l where l.id=list_id));
create policy list_likes_remove on public.list_likes for delete to authenticated using(user_id=(select auth.uid()));
create policy list_saves_read on public.list_saves for select to authenticated using(user_id=(select auth.uid()));
create policy list_saves_create on public.list_saves for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.lists l where l.id=list_id and l.owner_id<>auth.uid()));
create policy list_saves_remove on public.list_saves for delete to authenticated using(user_id=(select auth.uid()));

create function void_private.list_text(value text) returns text language sql immutable set search_path='' as $$select btrim(regexp_replace(regexp_replace(coalesce(value,''),'<[^>]*>','','g'),'[[:cntrl:]]','','g'));$$;
revoke all on function void_private.list_text(text) from public,anon,authenticated;
grant execute on function void_private.list_text(text) to authenticated;
create function void_private.list_limit(scope text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();used integer;bucket_at timestamptz;
begin
 if actor is null then raise insufficient_privilege;end if;
 if scope not in('list_create','list_action') then raise insufficient_privilege;end if;
 bucket_at:=date_trunc(case when scope='list_create' then 'hour' else 'minute' end,clock_timestamp());
 insert into void_private.write_limits as w values(actor,scope,bucket_at,1)
 on conflict(user_id,action) do update set bucket=excluded.bucket,n=case when w.bucket=excluded.bucket then w.n+1 else 1 end returning n into used;
 if used>(case when scope='list_create' then 10 else 60 end) then raise exception 'RATE_LIMIT';end if;
end;$$;
revoke all on function void_private.list_limit(text) from public,anon,authenticated;
create function void_private.list_action_limit() returns void language sql security definer set search_path='' as $$select void_private.list_limit('list_action');$$;
revoke all on function void_private.list_action_limit() from public,anon,authenticated;
grant execute on function void_private.list_action_limit() to authenticated;
create function void_private.list_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if auth.uid() is not null then perform void_private.list_limit('list_create');end if;
  new.created_at:=clock_timestamp();
 else
  if new.owner_id<>old.owner_id or new.id<>old.id then raise exception 'INVALID_LIST';end if;
  new.created_at:=old.created_at;
 end if;
 new.title:=void_private.list_text(new.title);new.description:=void_private.list_text(new.description);new.updated_at:=clock_timestamp();return new;
end;$$;
revoke all on function void_private.list_guard() from public,anon,authenticated;
create trigger list_guard before insert or update on public.lists for each row execute function void_private.list_guard();
create trigger list_username before insert or update on public.lists for each row execute function void_private.require_username();

create function void_private.list_item_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare parent uuid;title text;poster text;
begin
 if tg_op='UPDATE' and (new.list_id,new.media_type,new.external_id) is distinct from (old.list_id,old.media_type,old.external_id) then raise exception 'INVALID_ITEM';end if;
 select id into parent from public.lists where id=new.list_id and owner_id=auth.uid() for update;
 if parent is null then raise insufficient_privilege;end if;
 if tg_op='INSERT' and (select count(*) from public.list_items where list_id=parent)>=200 and not exists(select 1 from public.list_items where list_id=parent and media_type=new.media_type and external_id=new.external_id) then raise exception 'LIST_LIMIT';end if;
 title:=void_private.list_text(new.snapshot->>'titulo');poster:=coalesce(new.snapshot->>'poster','');
 if length(title) not between 1 and 200 or length(poster)>1000 or (poster<>'' and poster !~ '^https://[^[:space:]]+$') or length(coalesce(new.snapshot->>'ano',''))>20 then raise exception 'INVALID_ITEM';end if;
 new.snapshot:=jsonb_build_object('id',new.external_id,'categoria',new.media_type,'titulo',title,'poster',poster,'ano',void_private.list_text(new.snapshot->>'ano'));
 new.note:=void_private.list_text(new.note);
 if tg_op='INSERT' then new.added_at:=clock_timestamp();else new.added_at:=old.added_at;end if;return new;
end;$$;
revoke all on function void_private.list_item_guard() from public,anon,authenticated;
create trigger list_item_guard before insert or update on public.list_items for each row execute function void_private.list_item_guard();
create function void_private.list_touch() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 update public.lists set updated_at=clock_timestamp() where id=case when tg_op='DELETE' then old.list_id else new.list_id end;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
revoke all on function void_private.list_touch() from public,anon,authenticated;
create trigger list_item_touch after insert or update or delete on public.list_items for each row execute function void_private.list_touch();
create function void_private.list_reaction_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin perform void_private.list_limit('list_action');return new;end;$$;
revoke all on function void_private.list_reaction_guard() from public,anon,authenticated;
create trigger list_like_rate before insert on public.list_likes for each row execute function void_private.list_reaction_guard();
create trigger list_save_rate before insert on public.list_saves for each row execute function void_private.list_reaction_guard();
create trigger list_like_username before insert on public.list_likes for each row execute function void_private.require_username();
create trigger list_save_username before insert on public.list_saves for each row execute function void_private.require_username();

create function public.void_list_write(target uuid,metadata jsonb,entries jsonb default null,expected_version timestamptz default null) returns uuid language plpgsql security invoker set search_path='' as $$
declare id uuid:=target;previous timestamptz;entry jsonb;index integer:=0;
begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 perform void_private.list_action_limit();
 if jsonb_typeof(metadata)<>'object' or jsonb_typeof(metadata->'title')<>'string' or jsonb_typeof(metadata->'ranked')<>'boolean' then raise exception 'INVALID_LIST';end if;
 if entries is not null and (jsonb_typeof(entries)<>'array' or jsonb_array_length(entries)>200) then raise exception 'LIST_LIMIT';end if;
 if target is null then
  insert into public.lists(owner_id,title,description,visibility,ranked) values(auth.uid(),metadata->>'title',coalesce(metadata->>'description',''),metadata->>'visibility',(metadata->>'ranked')::boolean) returning lists.id into id;
 else
  select updated_at into previous from public.lists where lists.id=target and owner_id=auth.uid() for update;
  if not found then raise insufficient_privilege;end if;
  if expected_version is null or expected_version<>previous then raise exception 'LIST_CONFLICT';end if;
  update public.lists set title=metadata->>'title',description=coalesce(metadata->>'description',''),visibility=metadata->>'visibility',ranked=(metadata->>'ranked')::boolean where lists.id=target;
 end if;
 if entries is not null then
  -- One transaction: duplicate/invalid entries roll back metadata and item changes.
  -- Keep original added_at for items that remain in the list.
  delete from public.list_items i where i.list_id=id and not exists(select 1 from jsonb_array_elements(entries) e where e->>'media_type'=i.media_type and e->>'external_id'=i.external_id);
  for entry in select * from jsonb_array_elements(entries) loop
   insert into public.list_items(list_id,media_type,external_id,position,note,snapshot) values(id,entry->>'media_type',entry->>'external_id',index,coalesce(entry->>'note',''),entry->'snapshot')
   on conflict(list_id,media_type,external_id) do update set position=excluded.position,note=excluded.note,snapshot=excluded.snapshot;
   index:=index+1;
  end loop;
  if (select count(*) from public.list_items where list_id=id)<>index then raise exception 'INVALID_ITEMS';end if;
 end if;
 return id;
end;$$;
create function public.void_list_item_toggle(target uuid,entry jsonb,present boolean) returns boolean language plpgsql security invoker set search_path='' as $$
declare next_position integer;
begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 perform void_private.list_action_limit();
 perform 1 from public.lists where id=target and owner_id=auth.uid() for update;
 if not found then raise insufficient_privilege;end if;
 if present then
  if exists(select 1 from public.list_items where list_id=target and media_type=entry->>'media_type' and external_id=entry->>'external_id') then return true;end if;
  select min(n) into next_position from generate_series(0,199) n where not exists(select 1 from public.list_items where list_id=target and position=n);
  -- Append after existing items, compacting gaps left by removals first.
  update public.list_items i set position=t.n from(select media_type,external_id,(row_number() over(order by position)-1)::smallint n from public.list_items where list_id=target)t where i.list_id=target and i.media_type=t.media_type and i.external_id=t.external_id;
  select count(*) into next_position from public.list_items where list_id=target;
  if next_position>=200 then raise exception 'LIST_LIMIT';end if;
  insert into public.list_items(list_id,media_type,external_id,position,note,snapshot) values(target,entry->>'media_type',entry->>'external_id',next_position,coalesce(entry->>'note',''),entry->'snapshot');
 else delete from public.list_items where list_id=target and media_type=entry->>'media_type' and external_id=entry->>'external_id';end if;
 return present;
end;$$;

create function public.void_lists_page(section text default 'discover',ordering text default 'recent',target uuid default null,page_number integer default 0) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if section not in('mine','discover','following','saved','profile') or ordering not in('recent','popular') or page_number not between 0 and 10000 then raise exception 'INVALID_QUERY';end if;
 with candidates as(
  select l.*,p.display_name,p.username,p.avatar_url,(select count(*) from public.list_likes k where k.list_id=l.id) likes
  from public.lists l join public.void_community_profiles p on p.user_id=l.owner_id
  where case section when 'mine' then l.owner_id=auth.uid() when 'saved' then exists(select 1 from public.list_saves s where s.list_id=l.id and s.user_id=auth.uid()) when 'following' then exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followed_id=l.owner_id) when 'profile' then l.owner_id=target else l.visibility='public' end
  order by case when ordering='popular' then(select count(*) from public.list_likes k where k.list_id=l.id) else 0 end desc,l.updated_at desc,l.id desc limit 13 offset page_number*12
 ), numbered as(select *,row_number() over(order by case when ordering='popular' then likes else 0 end desc,updated_at desc,id desc) rn from candidates)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(t)-'rn' order by rn) from(
  select n.*,(select count(*) from public.list_items i where i.list_id=n.id) item_count,
  coalesce((select jsonb_agg(c.snapshot order by c.position) from(select snapshot,position from public.list_items where list_id=n.id order by position limit 4)c),'[]'::jsonb) cover
  from numbered n where rn<=12)t),'[]'::jsonb),'has_more',(select count(*)>12 from candidates)) into result;
 return result;
end;$$;
create function public.void_list_detail(target uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select to_jsonb(l)||jsonb_build_object('display_name',p.display_name,'username',p.username,'avatar_url',p.avatar_url,
 'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.position) from public.list_items i where i.list_id=l.id),'[]'::jsonb),
 'likes',(select count(*) from public.list_likes where list_id=l.id),
 'liked',exists(select 1 from public.list_likes where list_id=l.id and user_id=auth.uid()),
 'saved',exists(select 1 from public.list_saves where list_id=l.id and user_id=auth.uid()))
 from public.lists l join public.void_community_profiles p on p.user_id=l.owner_id where l.id=target;
$$;
-- Anonymous detail needs to read only its own (empty) saves; explicit RLS applies.
grant select on public.list_saves to anon;
create policy list_saves_anon_closed on public.list_saves for select to anon using(false);
revoke all on function public.void_list_write(uuid,jsonb,jsonb,timestamptz),public.void_list_item_toggle(uuid,jsonb,boolean),public.void_lists_page(text,text,uuid,integer),public.void_list_detail(uuid) from public,anon,authenticated;
grant execute on function public.void_list_write(uuid,jsonb,jsonb,timestamptz),public.void_list_item_toggle(uuid,jsonb,boolean) to authenticated;
grant execute on function public.void_lists_page(text,text,uuid,integer),public.void_list_detail(uuid) to anon,authenticated;
commit;
