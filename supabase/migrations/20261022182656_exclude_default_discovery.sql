begin;
create or replace function public.void_lists_page_v2(section text default 'discover',ordering text default 'recent',target uuid default null,page_number integer default 0,media_filter text default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if section not in('mine','discover','following','saved','profile') or ordering not in('recent','popular') or page_number not between 0 and 10000 then raise exception 'INVALID_QUERY';end if;
 if media_filter is not null and media_filter not in('filmes','series','jogos','animes') then raise exception 'INVALID_QUERY';end if;
 with candidates as(
  select l.*,p.display_name,p.username,p.avatar_url,exists(select 1 from public.list_likes k where k.list_id=l.id and k.user_id=(select auth.uid())) liked,(select count(*) from public.list_likes k where k.list_id=l.id) likes
  from public.lists l join public.void_community_profiles p on p.user_id=l.owner_id
  where (section not in('discover','following') or l.source_key is null) and (media_filter is null or l.media_types @> array[media_filter]) and case section when 'mine' then l.owner_id=auth.uid() and l.source_key is null when 'saved' then exists(select 1 from public.list_saves s where s.list_id=l.id and s.user_id=auth.uid()) when 'following' then exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followed_id=l.owner_id) when 'profile' then l.owner_id=target else l.visibility='public' end
  order by case when ordering='popular' then(select count(*) from public.list_likes k where k.list_id=l.id) else 0 end desc,l.updated_at desc,l.id desc limit 13 offset page_number*12
 ), numbered as(select *,row_number() over(order by case when ordering='popular' then likes else 0 end desc,updated_at desc,id desc) rn from candidates)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(t)-'rn' order by rn) from(
  select n.*,(select count(*) from public.void_list_entries i where i.list_id=n.id) item_count,
  coalesce((select jsonb_agg(c.snapshot order by c.position) from(select snapshot,position from public.void_list_entries where list_id=n.id order by position limit 4)c),'[]'::jsonb) cover
  from numbered n where rn<=12)t),'[]'::jsonb),'has_more',(select count(*)>12 from candidates)) into result;
 return result;
end;$$;
commit;
