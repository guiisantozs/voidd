begin;
create function public.void_anime_progress_summary(targets bigint[]) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from (
 select p.series_id,count(*) watched from public.void_series_episode_progress p
 where p.user_id=(select auth.uid()) and p.season_number=1 and p.series_id in(select id from unnest(targets) id where id>9000000000 order by id limit 12)
 group by p.series_id) s;
$$;
revoke all on function public.void_anime_progress_summary(bigint[]) from public,anon,authenticated;
grant execute on function public.void_anime_progress_summary(bigint[]) to authenticated;
notify pgrst,'reload schema';
commit;
