-- Descriptive categories; mixed lists remain supported and RLS stays authoritative.
alter table public.lists add column media_types text[] not null default array['filmes','series','jogos','animes'];
alter table public.lists add constraint lists_media_types_valid check (
 array_ndims(media_types)=1 and cardinality(media_types) between 1 and 4
 and media_types <@ array['filmes','series','jogos','animes'] and array_position(media_types,null) is null
 and cardinality(media_types)=(case when 'filmes'=any(media_types) then 1 else 0 end+case when 'series'=any(media_types) then 1 else 0 end+case when 'jogos'=any(media_types) then 1 else 0 end+case when 'animes'=any(media_types) then 1 else 0 end)
);
create index lists_media_types_gin on public.lists using gin(media_types);
grant insert(media_types),update(media_types) on public.lists to authenticated;

create or replace function public.void_list_write(target uuid,metadata jsonb,entries jsonb default null,expected_version timestamptz default null) returns uuid language plpgsql security invoker set search_path='' as $$
declare id uuid:=target;previous timestamptz;entry jsonb;index integer:=0;types text[];
begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 perform void_private.list_action_limit();
 if jsonb_typeof(metadata)<>'object' or jsonb_typeof(metadata->'title')<>'string' or jsonb_typeof(metadata->'ranked')<>'boolean' then raise exception 'INVALID_LIST';end if;
 if entries is not null and (jsonb_typeof(entries)<>'array' or jsonb_array_length(entries)>200) then raise exception 'LIST_LIMIT';end if;
 if metadata ? 'media_types' then
  if jsonb_typeof(metadata->'media_types')<>'array' then raise exception 'INVALID_LIST';end if;
  types:=array(select jsonb_array_elements_text(metadata->'media_types'));
 end if;
 if target is null then
  insert into public.lists(owner_id,title,description,visibility,ranked,media_types) values(auth.uid(),metadata->>'title',coalesce(metadata->>'description',''),metadata->>'visibility',(metadata->>'ranked')::boolean,coalesce(types,array['filmes','series','jogos','animes'])) returning lists.id into id;
 else
  select updated_at into previous from public.lists where lists.id=target and owner_id=auth.uid() for update;
  if not found then raise insufficient_privilege;end if;
  if expected_version is null or expected_version<>previous then raise exception 'LIST_CONFLICT';end if;
  update public.lists set title=metadata->>'title',description=coalesce(metadata->>'description',''),visibility=metadata->>'visibility',ranked=(metadata->>'ranked')::boolean,media_types=coalesce(types,lists.media_types) where lists.id=target;
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

create function public.void_lists_page_v2(section text default 'discover',ordering text default 'recent',target uuid default null,page_number integer default 0,media_filter text default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if section not in('mine','discover','following','saved','profile') or ordering not in('recent','popular') or page_number not between 0 and 10000 then raise exception 'INVALID_QUERY';end if;
 if media_filter is not null and media_filter not in('filmes','series','jogos','animes') then raise exception 'INVALID_QUERY';end if;
 with candidates as(
  select l.*,p.display_name,p.username,p.avatar_url,exists(select 1 from public.list_likes k where k.list_id=l.id and k.user_id=(select auth.uid())) liked,(select count(*) from public.list_likes k where k.list_id=l.id) likes
  from public.lists l join public.void_community_profiles p on p.user_id=l.owner_id
  where (media_filter is null or l.media_types @> array[media_filter]) and case section when 'mine' then l.owner_id=auth.uid() when 'saved' then exists(select 1 from public.list_saves s where s.list_id=l.id and s.user_id=auth.uid()) when 'following' then exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followed_id=l.owner_id) when 'profile' then l.owner_id=target else l.visibility='public' end
  order by case when ordering='popular' then(select count(*) from public.list_likes k where k.list_id=l.id) else 0 end desc,l.updated_at desc,l.id desc limit 13 offset page_number*12
 ), numbered as(select *,row_number() over(order by case when ordering='popular' then likes else 0 end desc,updated_at desc,id desc) rn from candidates)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(t)-'rn' order by rn) from(
  select n.*,(select count(*) from public.list_items i where i.list_id=n.id) item_count,
  coalesce((select jsonb_agg(c.snapshot order by c.position) from(select snapshot,position from public.list_items where list_id=n.id order by position limit 4)c),'[]'::jsonb) cover
  from numbered n where rn<=12)t),'[]'::jsonb),'has_more',(select count(*)>12 from candidates)) into result;
 return result;
end;$$;


revoke all on function public.void_lists_page_v2(text,text,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.void_lists_page_v2(text,text,uuid,integer,text) to anon,authenticated;
