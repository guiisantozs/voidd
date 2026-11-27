begin;
create or replace function public.void_profile_overview(target uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare p jsonb; result jsonb; own boolean:=coalesce(target=auth.uid(),false); following boolean;
begin
 following:=exists(select 1 from public.follows where follower_id=auth.uid() and followed_id=target);
 if not coalesce(void_private.can_view_profile(target),false) then return jsonb_build_object('locked',true,'following',following);end if;
 select to_jsonb(c) into p from public.void_community_profiles c where user_id=target;
 if p is null and not own then return jsonb_build_object('notFound',true);end if;
 if p is null then
  select jsonb_build_object('user_id',target,'display_name',display_name,'bio',bio,'visibility','private','username','void_'||replace(target::text,'-','')) into p from public.void_profiles where user_id=target;
  p:=coalesce(p,jsonb_build_object('user_id',target,'display_name','Seu perfil','bio','','visibility','private','username','void_'||replace(target::text,'-','')));
 end if;
 with records as materialized(select item_key,payload,updated_at,(payload->>'nota')::numeric rating from public.void_records where user_id=target and kind='review' and payload is not null),
 media as(select split_part(item_key,':',1) media,count(*) total from records group by 1),
 hist as(select n,count(r.rating) total from generate_series(0,10) n left join records r on round(r.rating*2)=n group by n),
 genres as(select g.genre,count(*) total from records r cross join lateral jsonb_array_elements_text(case when jsonb_typeof(r.payload->'item'->'generos')='array' then r.payload->'item'->'generos' else '[]'::jsonb end) g(genre) group by g.genre order by count(*) desc,g.genre limit 5)
 select jsonb_build_object('profile',p,'is_owner',own,'following',following,'is_friend',target=any(public.void_detail_friend_ids()),
 'counts',jsonb_build_object('reviews',(select count(*) from records),'followers',(select count(*) from public.follows where followed_id=target),'following',(select count(*) from public.follows where follower_id=target),'friends',cardinality(public.void_profile_friend_ids(target))),
 'media',coalesce((select jsonb_agg(to_jsonb(m)) from media m),'[]'::jsonb),'histogram',(select jsonb_agg(to_jsonb(hist) order by n) from hist),'genres',coalesce((select jsonb_agg(to_jsonb(genres)) from genres),'[]'::jsonb),
 'recent',coalesce((select jsonb_agg(to_jsonb(t)) from(select item_key,payload,updated_at from records order by updated_at desc,item_key limit 8) t),'[]'::jsonb),
 'favorites',coalesce((select jsonb_agg(to_jsonb(f) order by media_type,slot) from public.profile_favorites f where user_id=target),'[]'::jsonb)) into result;
 return result;
end;$$;


commit;