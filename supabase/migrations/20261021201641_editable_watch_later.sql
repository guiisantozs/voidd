-- Only metadata is stored in lists; movies stay in the original synced watchlist.
alter table public.lists add column source_key text check(source_key is null or source_key='watchlist');
create unique index lists_owner_source_unique on public.lists(owner_id,source_key) where source_key is not null;
grant insert(source_key) on public.lists to authenticated;

create function void_private.standard_list_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' then
  if old.source_key is not null and auth.uid() is not null then raise exception 'STANDARD_LIST';end if;
  return old;
 end if;
 if tg_op='UPDATE' and new.source_key is distinct from old.source_key then raise exception 'STANDARD_LIST';end if;
 if new.source_key='watchlist' then new.media_types:=array['filmes'];new.ranked:=false;end if;
 return new;
end;$$;
revoke all on function void_private.standard_list_guard() from public,anon,authenticated;
create trigger standard_list_guard before insert or update or delete on public.lists for each row execute function void_private.standard_list_guard();

-- The list's visibility and profile visibility authorize only its watchlist records.
create policy watchlist_shared_read on public.void_records for select to anon,authenticated using(
 kind='watchlist' and payload is not null and exists(select 1 from public.lists l where l.owner_id=void_records.user_id and l.source_key='watchlist')
);
create view public.void_list_entries with(security_invoker=true) as
 select i.list_id,i.media_type,i.external_id,i.position::bigint,i.note,i.snapshot,i.added_at from public.list_items i
 union all
 select l.id,'filmes'::text,r.item_key,row_number() over(partition by l.id order by r.item_key)-1,''::text,
 jsonb_build_object('id',r.item_key,'categoria','filmes','titulo',r.payload->'item'->>'titulo','poster',r.payload->'item'->>'poster','ano',r.payload->'item'->>'ano'),l.created_at
 from public.lists l join public.void_records r on r.user_id=l.owner_id and r.kind='watchlist' and r.payload is not null where l.source_key='watchlist';
revoke all on public.void_list_entries from public,anon,authenticated;
grant select on public.void_list_entries to anon,authenticated;

create function void_private.standard_items_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.lists l where l.id=new.list_id and l.source_key is not null) then raise exception 'STANDARD_LIST';end if;
 return new;
end;$$;
revoke all on function void_private.standard_items_guard() from public,anon,authenticated;
create trigger standard_items_guard before insert or update on public.list_items for each row execute function void_private.standard_items_guard();

create function public.void_watchlist_edit() returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 select id into result from public.lists where owner_id=auth.uid() and source_key='watchlist';
 if result is null then
  insert into public.lists(owner_id,title,description,visibility,ranked,media_types,source_key)
  values(auth.uid(),'Ver depois','Os filmes que você guardou para a próxima sessão.','private',false,array['filmes'],'watchlist')
  on conflict(owner_id,source_key) where source_key is not null do nothing returning id into result;
  if result is null then select id into result from public.lists where owner_id=auth.uid() and source_key='watchlist';end if;
 end if;
 return result;
end;$$;
revoke all on function public.void_watchlist_edit() from public,anon,authenticated;
grant execute on function public.void_watchlist_edit() to authenticated;

create or replace function public.void_lists_page_v2(section text default 'discover',ordering text default 'recent',target uuid default null,page_number integer default 0,media_filter text default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if section not in('mine','discover','following','saved','profile') or ordering not in('recent','popular') or page_number not between 0 and 10000 then raise exception 'INVALID_QUERY';end if;
 if media_filter is not null and media_filter not in('filmes','series','jogos','animes') then raise exception 'INVALID_QUERY';end if;
 with candidates as(
  select l.*,p.display_name,p.username,p.avatar_url,exists(select 1 from public.list_likes k where k.list_id=l.id and k.user_id=(select auth.uid())) liked,(select count(*) from public.list_likes k where k.list_id=l.id) likes
  from public.lists l join public.void_community_profiles p on p.user_id=l.owner_id
  where (media_filter is null or l.media_types @> array[media_filter]) and case section when 'mine' then l.owner_id=auth.uid() and l.source_key is null when 'saved' then exists(select 1 from public.list_saves s where s.list_id=l.id and s.user_id=auth.uid()) when 'following' then exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followed_id=l.owner_id) when 'profile' then l.owner_id=target else l.visibility='public' end
  order by case when ordering='popular' then(select count(*) from public.list_likes k where k.list_id=l.id) else 0 end desc,l.updated_at desc,l.id desc limit 13 offset page_number*12
 ), numbered as(select *,row_number() over(order by case when ordering='popular' then likes else 0 end desc,updated_at desc,id desc) rn from candidates)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(t)-'rn' order by rn) from(
  select n.*,(select count(*) from public.void_list_entries i where i.list_id=n.id) item_count,
  coalesce((select jsonb_agg(c.snapshot order by c.position) from(select snapshot,position from public.void_list_entries where list_id=n.id order by position limit 4)c),'[]'::jsonb) cover
  from numbered n where rn<=12)t),'[]'::jsonb),'has_more',(select count(*)>12 from candidates)) into result;
 return result;
end;$$;



create or replace function public.void_list_detail(target uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select to_jsonb(l)||jsonb_build_object('display_name',p.display_name,'username',p.username,'avatar_url',p.avatar_url,
 'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.position) from public.void_list_entries i where i.list_id=l.id),'[]'::jsonb),
 'likes',(select count(*) from public.list_likes where list_id=l.id),
 'liked',exists(select 1 from public.list_likes where list_id=l.id and user_id=auth.uid()),
 'saved',exists(select 1 from public.list_saves where list_id=l.id and user_id=auth.uid()))
 from public.lists l join public.void_community_profiles p on p.user_id=l.owner_id where l.id=target;
$$;
