begin;
-- Audit on 2026-10-21: 13 persisted reviews, min .5, max 5. The old
-- payload_shape constraint enforced .5..5 in half steps. No halving: the
-- old /10 ratings were display/RPC conversions, not stored /10 records.
-- Keep the records and timestamps intact; accept 0 and tenths from now on.
alter table public.void_records drop constraint payload_shape;
alter table public.void_records add constraint payload_shape check(payload is null or (
jsonb_typeof(payload)='object' and jsonb_typeof(payload->'item')='object'
and jsonb_typeof(payload->'item'->'titulo')='string'
and case when kind='watchlist' then payload->'item'->>'categoria'='filmes' and payload->'item'->>'id'=item_key
when kind='library' then payload->>'status' in ('want','playing','finished','paused') and payload->'item'->>'categoria'='jogos' and payload->'item'->>'id'=item_key
else jsonb_typeof(payload->'nota')='number' and coalesce((payload->>'ratingScale')::numeric,5)=5 and (payload->>'nota')::numeric between 0 and 5 and mod((payload->>'nota')::numeric*10,1)=0
and char_length(coalesce(payload->>'texto',''))<=2000
and concat(payload->'item'->>'categoria',':',payload->'item'->>'id')=item_key end) is true);

create or replace function public.void_movie_review_summary_v2(movie_key text) returns jsonb language sql stable security invoker set search_path='' as $$
with reviews as(select r.user_id,(r.payload->>'nota')::numeric rating from public.void_records r where r.item_key=movie_key and r.kind='review' and r.is_public),
friends as(select * from reviews where user_id=any(public.void_detail_friend_ids())),
hist as(select n,count(r.rating) total from generate_series(0,10) n left join reviews r on round(r.rating*2)=n group by n)
select jsonb_build_object('average',(select avg(rating) from reviews),'total',(select count(*) from reviews),
'histogram',(select jsonb_agg(jsonb_build_object('rating',n/2.0,'total',total) order by n) from hist),
'friendCount',(select count(*) from friends),'friendAverage',(select avg(rating) from friends),
'friends',coalesce((select jsonb_agg(jsonb_build_object('user_id',f.user_id,'rating',f.rating,'display_name',coalesce(p.display_name,'Pessoa do VOID'))) from friends f left join public.void_community_profiles p using(user_id)),'[]'::jsonb));
$$;

-- Threshold is in the canonical 0..5 scale.
create or replace function public.void_movie_review_page_v2(movie_key text,sort_by text default 'recent',min_rating numeric default 0,max_rating numeric default 5,page_offset integer default 0,friends_only boolean default false,unpopular_threshold numeric default 1.5) returns jsonb language sql stable security invoker set search_path='' as $$
with reviews as (
 select r.user_id,r.item_key,r.payload,r.updated_at,coalesce(p.display_name,'Pessoa do VOID') display_name,
 (r.payload->>'nota')::numeric rating,r.user_id=any(public.void_detail_friend_ids()) is_friend
 from public.void_records r left join public.void_community_profiles p using(user_id) where r.item_key=movie_key and r.kind='review' and r.is_public
), rated as (
 select r.*, (select count(*) from public.void_review_likes l where l.item_key=movie_key and l.review_user=r.user_id) likes,
 exists(select 1 from public.void_review_likes l where l.item_key=movie_key and l.review_user=r.user_id and l.user_id=(select auth.uid())) liked,
 (select count(*) from public.void_review_comments c where c.item_key=movie_key and c.review_user=r.user_id) comments
 from reviews r where r.rating between min_rating and max_rating and (not friends_only or is_friend)
), paged as (
 select * from rated order by case when sort_by='friends' then is_friend::integer else 0 end desc,
 case when sort_by='likes' then likes else 0 end desc,updated_at desc,user_id limit 20 offset greatest(0,least(page_offset,100000))
)
select jsonb_build_object('total',(select count(*) from rated),'reviews',coalesce((select jsonb_agg(jsonb_build_object(
'user_id',user_id,'display_name',display_name,'rating',rating,'text',coalesce(payload->>'texto',''),'spoiler',coalesce(payload->>'spoiler','false')='true',
'updated_at',updated_at,'watched_at',payload->>'data','rewatched',coalesce(payload->>'revi','false')='true','is_friend',is_friend,'likes',likes,'liked',liked,'comments',comments,
'unpopular',(select count(*) from reviews)>=5 and abs(rating-(select avg(rating) from reviews))>=greatest(0.5,unpopular_threshold))) from paged),'[]'::jsonb));
$$;


create or replace function public.void_profile_overview_v2(target uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare p jsonb; result jsonb; own boolean:=coalesce(target=auth.uid(),false); following boolean;
begin
 following:=exists(select 1 from public.follows where follower_id=auth.uid() and followed_id=target);
 if not coalesce(void_private.can_view_profile(target),false) then return jsonb_build_object('locked',true,'following',following);end if;
 select to_jsonb(c) into p from public.void_community_profiles c where user_id=target;
 if p is null and not own then return jsonb_build_object('notFound',true);end if;
 if p is null then
  select jsonb_build_object('user_id',target,'display_name',display_name,'bio',bio,'visibility','public','username','void_'||replace(target::text,'-','')) into p from public.void_profiles where user_id=target;
  p:=coalesce(p,jsonb_build_object('user_id',target,'display_name','Seu perfil','bio','','visibility','public','username','void_'||replace(target::text,'-','')));
 end if;
 with records as materialized(select item_key,payload,updated_at,(payload->>'nota')::numeric rating from public.void_records where user_id=target and kind='review' and payload is not null),
 media as(select split_part(item_key,':',1) media,count(*) total from records group by 1),
 hist as(select n/2.0 n,count(r.rating) total from generate_series(0,10) n left join records r on round(r.rating*2)=n group by n),
 genres as(select g.genre,count(*) total from records r cross join lateral jsonb_array_elements_text(case when jsonb_typeof(r.payload->'item'->'generos')='array' then r.payload->'item'->'generos' else '[]'::jsonb end) g(genre) group by g.genre order by count(*) desc,g.genre limit 5)
 select jsonb_build_object('profile',p,'is_owner',own,'following',following,'is_friend',target=any(public.void_detail_friend_ids()),
 'counts',jsonb_build_object('reviews',(select count(*) from records),'followers',(select count(*) from public.follows where followed_id=target),'following',(select count(*) from public.follows where follower_id=target),'friends',cardinality(public.void_profile_friend_ids(target))),
 'media',coalesce((select jsonb_agg(to_jsonb(m)) from media m),'[]'::jsonb),'histogram',(select jsonb_agg(to_jsonb(hist) order by n) from hist),'genres',coalesce((select jsonb_agg(to_jsonb(genres)) from genres),'[]'::jsonb),
 'recent',coalesce((select jsonb_agg(to_jsonb(t)) from(select item_key,payload,updated_at from records order by updated_at desc,item_key limit 8) t),'[]'::jsonb),
 'favorites',coalesce((select jsonb_agg(to_jsonb(f) order by media_type,slot) from public.profile_favorites f where user_id=target),'[]'::jsonb)) into result;
 return result;
end;$$;

create or replace function public.void_profile_reviews_v2(target uuid,media text default 'all',min_rating numeric default 0,max_rating numeric default 5,sort_by text default 'recent',page_offset integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$
with rows as materialized(select item_key,payload,updated_at,(payload->>'nota')::numeric rating from public.void_records where user_id=target and kind='review' and payload is not null and void_private.can_view_profile(target)
 and (media='all' or split_part(item_key,':',1)=media) and (payload->>'nota')::numeric between min_rating and max_rating),
paged as(select item_key,payload,updated_at from rows order by case when sort_by='rating' then rating end desc nulls last,updated_at desc,item_key limit 20 offset greatest(0,least(page_offset,100000)))
select jsonb_build_object('total',(select count(*) from rows),'reviews',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb));
$$;


-- Versioned RPCs keep the deployed /10 frontend compatible during rollout.
revoke all on function public.void_movie_review_summary_v2(text),public.void_movie_review_page_v2(text,text,numeric,numeric,integer,boolean,numeric),public.void_profile_overview_v2(uuid),public.void_profile_reviews_v2(uuid,text,numeric,numeric,text,integer) from public,anon,authenticated;
grant execute on function public.void_movie_review_summary_v2(text),public.void_movie_review_page_v2(text,text,numeric,numeric,integer,boolean,numeric),public.void_profile_overview_v2(uuid),public.void_profile_reviews_v2(uuid,text,numeric,numeric,text,integer) to anon,authenticated;
notify pgrst, 'reload schema';
commit;
