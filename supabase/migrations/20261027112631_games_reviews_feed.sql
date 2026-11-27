begin;
-- Additive only. No payloads, privacy flags, profiles or library rows change.
-- Relax only media validation; existing movie keys remain valid and all RLS,
-- ownership, foreign keys and write budgets remain unchanged.
alter table public.void_review_likes drop constraint void_review_likes_item_key_check;
alter table public.void_review_likes add constraint void_review_likes_item_key_check check(item_key ~ '^(filmes|jogos):[1-9][0-9]*$');
alter table public.void_review_comments drop constraint void_review_comments_item_key_check;
alter table public.void_review_comments add constraint void_review_comments_item_key_check check(item_key ~ '^(filmes|jogos):[1-9][0-9]*$');
create index void_public_reviews_created_media on public.void_records((split_part(item_key,':',1)),created_at desc,user_id desc,item_key desc) where kind='review' and is_public;
create index void_public_games_feed_work on public.void_records(item_key,created_at desc,user_id) where kind='review' and is_public and item_key like 'jogos:%';

create function public.void_feed_friend_ids() returns table(user_id uuid)
language plpgsql stable security invoker set search_path='' as $$
begin
 if (select auth.uid()) is null then return; end if;
 return query select case when f.sender=(select auth.uid()) then f.recipient else f.sender end
 from public.void_friendships f where f.status='accepted' and (f.sender=(select auth.uid()) or f.recipient=(select auth.uid()));
end;$$;
revoke all on function public.void_feed_friend_ids() from public,anon,authenticated;
grant execute on function public.void_feed_friend_ids() to anon,authenticated;

create function void_private.feed_status_time(value jsonb) returns timestamptz language plpgsql stable security invoker set search_path='' as $$
begin return (value->>'marked_at')::timestamptz; exception when others then return null; end;$$;
revoke all on function void_private.feed_status_time(jsonb) from public,anon,authenticated;
grant execute on function void_private.feed_status_time(jsonb) to anon,authenticated;

create function void_private.feed_game_matches(item jsonb,platform text,genre text) returns boolean
language sql immutable security invoker set search_path='' as $$
 select (platform='' or exists(select 1 from jsonb_array_elements_text(case when jsonb_typeof(item->'plataformas')='array' then item->'plataformas' else '[]'::jsonb end) p where lower(p) ~ case platform when 'pc' then '(^pc$|windows|linux|macos|mac os)' when 'playstation' then '(playstation|^ps[1-5])' when 'xbox' then 'xbox' when 'nintendo' then '(nintendo|switch|wii|gamecube|game boy|^nes$|^snes$)' else '^$' end))
 and (genre='' or exists(select 1 from jsonb_array_elements_text(case when jsonb_typeof(item->'generos')='array' then item->'generos' else '[]'::jsonb end) g where lower(g)=any(case genre when 'action' then array['action','ação'] when 'adventure' then array['adventure','aventura'] when 'role-playing-games-rpg' then array['rpg','role-playing games rpg'] when 'strategy' then array['strategy','estratégia'] when 'shooter' then array['shooter','tiro'] when 'puzzle' then array['puzzle'] when 'racing' then array['racing','corrida'] when 'sports' then array['sports','esportes'] when 'indie' then array['indie'] else array[]::text[] end)));
$$;
revoke all on function void_private.feed_game_matches(jsonb,text,text) from public,anon,authenticated;
grant execute on function void_private.feed_game_matches(jsonb,text,text) to anon,authenticated;

create function public.void_reviews_feed(media text default 'jogos',filters jsonb default '{}',after_cursor jsonb default null,as_of timestamptz default now(),seen_at timestamptz default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
 v_tab text:=coalesce(filters->>'tab','comunidade');v_period text:=coalesce(filters->>'period','month');
 v_min numeric:=coalesce((filters->>'minRating')::numeric,0);v_max numeric:=coalesce((filters->>'maxRating')::numeric,5);
 v_platform text:=coalesce(filters->>'platform','');v_genre text:=coalesce(filters->>'genre','');v_status text:=coalesce(filters->>'status','');
 v_text text:=coalesce(filters->>'text','all');v_sort text:=coalesce(filters->>'sort','recent');v_query text:=left(trim(coalesce(filters->>'q','')),100);
 v_anchor timestamptz:=least(coalesce(as_of,now()),now());v_start timestamptz;v_scope text;
 v_score numeric;v_time timestamptz;v_user uuid;v_item text;result jsonb;
begin
 if media not in('filmes','jogos','series','animes','livros') or jsonb_typeof(filters)<>'object' or v_tab not in('comunidade','amigos') or v_period not in('today','week','month','all') or v_min not between 0 and 5 or v_max not between v_min and 5 or v_text not in('all','with','ratings') or v_sort not in('recent','likes','highest','lowest','comments') or v_platform not in('','pc','playstation','xbox','nintendo') or v_genre not in('','action','adventure','role-playing-games-rpg','strategy','shooter','puzzle','racing','sports','indie') or v_status not in('','finished','platinum','playing','abandoned') then raise exception 'INVALID_FEED';end if;
 if after_cursor is not null then
  if jsonb_typeof(after_cursor)<>'object' then raise exception 'INVALID_CURSOR';end if;
  v_anchor:=(after_cursor->>'anchor')::timestamptz;v_score:=(after_cursor->>'score')::numeric;v_time:=(after_cursor->>'time')::timestamptz;v_user:=(after_cursor->>'user')::uuid;v_item:=after_cursor->>'item';
  if v_anchor is null or v_anchor>now() or v_time is null or v_score is null or v_user is null or v_item is null then raise exception 'INVALID_CURSOR';end if;
 end if;
 v_scope:=md5(media||filters::text||v_anchor::text);
 if after_cursor is not null and (after_cursor->>'scope') is distinct from v_scope then raise exception 'INVALID_CURSOR';end if;
 v_start:=case v_period when 'today' then date_trunc('day',v_anchor at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' when 'week' then v_anchor-interval '7 days' when 'month' then v_anchor-interval '30 days' else '-infinity'::timestamptz end;
 with friends as materialized(select * from public.void_feed_friend_ids()),
 visible as materialized(
  select r.user_id,r.item_key,r.created_at,r.updated_at,r.payload->'item' item,(r.payload->>'nota')::numeric rating,
   coalesce(r.payload->>'texto','') text,coalesce(r.payload->>'spoiler','false')='true' spoiler,
   p.display_name,p.username,p.avatar_url,p.avatar_id,exists(select 1 from friends f where f.user_id=r.user_id) is_friend,
   exists(select 1 from public.follows f where f.follower_id=(select auth.uid()) and f.followed_id=r.user_id) following,
   case when r.payload->'feed_context'->>'share_status'='true' and r.payload->'feed_context'->>'status' in('want','playing','playing_now','paused','finished','platinum','abandoned') then r.payload->'feed_context'->>'status' end author_status,
   case when r.payload->'feed_context'->>'share_status'='true' then void_private.feed_status_time(r.payload->'feed_context') end status_at,
   left(coalesce(r.payload->'feed_context'->>'platform',''),60) platform
  from public.void_records r join public.void_community_profiles p on p.user_id=r.user_id
  where r.kind='review' and r.is_public and r.payload is not null and split_part(r.item_key,':',1)=media and p.visibility<>'private' and r.created_at<=v_anchor
   and (v_tab='comunidade' or ((select auth.uid()) is not null and exists(select 1 from friends f where f.user_id=r.user_id)))
 ), filtered as materialized(
  select * from visible v where v.created_at>=v_start and v.rating between v_min and v_max and (v_query='' or strpos(lower(v.item->>'titulo'),lower(v_query))>0)
   and void_private.feed_game_matches(v.item,v_platform,v_genre)
   and (v_status='' or v.author_status=v_status or (v_status='playing' and v.author_status='playing_now'))
   and (v_text='all' or (v_text='with' and length(trim(v.text))>0) or (v_text='ratings' and length(trim(v.text))=0))
 ), likes as(select k.review_user,k.item_key,count(*) likes,bool_or(k.user_id=(select auth.uid())) liked from public.void_review_likes k join filtered f on f.user_id=k.review_user and f.item_key=k.item_key group by k.review_user,k.item_key),
 comments as(select c.review_user,c.item_key,count(*) comments from public.void_review_comments c join filtered f on f.user_id=c.review_user and f.item_key=c.item_key group by c.review_user,c.item_key),
 ranked as(select f.*,coalesce(l.likes,0) likes,coalesce(l.liked,false) liked,coalesce(c.comments,0) comments,
  case v_sort when 'likes' then coalesce(l.likes,0)::numeric when 'highest' then f.rating when 'lowest' then -f.rating when 'comments' then coalesce(c.comments,0)::numeric else 0 end sort_value
  from filtered f left join likes l on l.review_user=f.user_id and l.item_key=f.item_key left join comments c on c.review_user=f.user_id and c.item_key=f.item_key),
 page as materialized(select * from ranked r where after_cursor is null or (r.sort_value,r.created_at,r.user_id,r.item_key)<(v_score,v_time,v_user,v_item) order by sort_value desc,created_at desc,user_id desc,item_key desc limit 13),
 numbered as(select p.*,row_number() over(order by sort_value desc,created_at desc,user_id desc,item_key desc) rn from page p),
 weekly as(select item_key,(jsonb_agg(item order by created_at desc)->0) item,count(*) total,round(avg(rating),2) average from visible where created_at>=v_anchor-interval '7 days' group by item_key)
 select jsonb_build_object(
  'rows',coalesce((select jsonb_agg(to_jsonb(n)-'sort_value'-'rn' order by rn) from numbered n where rn<=12),'[]'::jsonb),
  'total',(select count(*) from filtered),'has_more',(select count(*)>12 from page),
  'cursor',case when (select count(*)>12 from page) then(select jsonb_build_object('score',sort_value,'time',created_at,'user',user_id,'item',item_key,'anchor',v_anchor,'scope',v_scope) from numbered where rn=12) else null end,
  'anchor',v_anchor,'new_count',(select count(*) from filtered where seen_at is not null and created_at>seen_at),
  'summary',(select jsonb_build_object('week_count',count(*),'average',round(avg(rating),2)) from visible where created_at>=v_anchor-interval '7 days'),
  'top_games',coalesce((select jsonb_agg(to_jsonb(t)) from(select * from weekly order by total desc,average desc,item_key limit 6)t),'[]'::jsonb),
  'friends_playing',coalesce((select jsonb_agg(to_jsonb(t)) from(select user_id,item_key,item,display_name,username,avatar_url,avatar_id,status_at from visible where is_friend and author_status='playing_now' and status_at>=v_anchor-interval '24 hours' and status_at<=v_anchor order by status_at desc,user_id limit 8)t),'[]'::jsonb)
 ) into result;return result;
end;$$;
revoke all on function public.void_reviews_feed(text,jsonb,jsonb,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.void_reviews_feed(text,jsonb,jsonb,timestamptz,timestamptz) to anon,authenticated;
comment on function public.void_reviews_feed(text,jsonb,jsonb,timestamptz,timestamptz) is 'All-media public review feed; caller RLS, accepted friends only, fixed anchor/keyset cursor. Status comes only from an explicit public review snapshot, never private library.';
notify pgrst,'reload schema';
commit;
