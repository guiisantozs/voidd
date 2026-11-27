begin;
-- RLS on the existing review table remains authoritative, including profile
-- visibility. No privileged reads and no changes to individual reviews.
create function public.void_anime_season_summary(targets bigint[]) returns jsonb
language sql stable security invoker set search_path='' as $$
 with allowed as(select distinct id from unnest(targets) id where id>9000000000 order by id limit 12),
 bins as(select r.series_id,ceil(r.rating)::integer bucket,count(*) n,sum(r.rating) points
 from public.void_series_unit_reviews r join allowed a on a.id=r.series_id
 where r.is_public and r.season_number=1 and r.episode_number=0 group by r.series_id,ceil(r.rating)),
 summaries as(select series_id,sum(n) total,sum(points)/sum(n) average,jsonb_object_agg(bucket::text,n) distribution from bins group by series_id)
 select coalesce(jsonb_agg(to_jsonb(summaries)),'[]'::jsonb) from summaries;
$$;
revoke all on function public.void_anime_season_summary(bigint[]) from public,anon,authenticated;
grant execute on function public.void_anime_season_summary(bigint[]) to anon,authenticated;
notify pgrst,'reload schema';
commit;
