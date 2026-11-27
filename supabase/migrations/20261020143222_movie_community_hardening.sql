begin;
-- Clients may not rewrite server timestamps or the generated visibility flag.
revoke insert,update on public.void_records from authenticated;
grant insert(user_id,kind,item_key,payload),update(user_id,kind,item_key,payload) on public.void_records to authenticated;
create or replace function public.void_friend_movies() returns jsonb
language sql stable security invoker set search_path='' as $$
select jsonb_build_object('friendCount',(select count(*) from public.void_friendships where status='accepted' and (select auth.uid()) in(sender,recipient)),
'movies',coalesce((select jsonb_agg(to_jsonb(t) order by t.updated_at desc) from (
select * from (
select distinct on(r.item_key) r.movie,r.rating,r.user_id,r.display_name,r.updated_at
from public.void_movie_reviews r where r.user_id in(
select case when sender=(select auth.uid()) then recipient else sender end from public.void_friendships
where status='accepted' and (select auth.uid()) in(sender,recipient))
order by r.item_key,r.updated_at desc,r.user_id
) recent order by updated_at desc limit 20
) t),'[]'::jsonb));
$$;
commit;
