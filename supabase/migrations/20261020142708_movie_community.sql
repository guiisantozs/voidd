begin;
alter table public.void_records drop constraint void_records_kind_check;
alter table public.void_records add constraint void_records_kind_check check(kind in ('review','library','watchlist'));
alter table public.void_records drop constraint valid_item_key;
alter table public.void_records add constraint valid_item_key check (
(kind='review' and item_key ~ '^(filmes|series|animes|jogos):[1-9][0-9]*$') or
(kind in ('library','watchlist') and item_key ~ '^[1-9][0-9]*$'));
alter table public.void_records drop constraint payload_shape;
alter table public.void_records add constraint payload_shape check(payload is null or (
jsonb_typeof(payload)='object' and jsonb_typeof(payload->'item')='object'
and jsonb_typeof(payload->'item'->'titulo')='string'
and case when kind='watchlist' then payload->'item'->>'categoria'='filmes' and payload->'item'->>'id'=item_key
when kind='library' then payload->>'status' in ('want','playing','finished','paused') and payload->'item'->>'categoria'='jogos' and payload->'item'->>'id'=item_key
else (payload->>'nota')::numeric between 0.5 and 5 and mod((payload->>'nota')::numeric*2,1)=0
and char_length(coalesce(payload->>'texto',''))<=2000
and concat(payload->'item'->>'categoria',':',payload->'item'->>'id')=item_key end) is true);
-- Historical reviews remain private. Public identity is deliberately separate from private profiles.
alter table public.void_records add column created_at timestamptz;
update public.void_records set created_at=updated_at;
alter table public.void_records alter column created_at set default now(), alter column created_at set not null;
alter table public.void_records add column is_public boolean generated always as
(kind='review' and payload is not null and coalesce(payload->>'public','false')='true') stored;
grant select on public.void_records to anon;
drop policy records_read on public.void_records;
create policy records_read on public.void_records for select to authenticated using(user_id=(select auth.uid()) or is_public);
create policy records_public on public.void_records for select to anon using(is_public);
create index void_public_movie_recent on public.void_records(updated_at desc,item_key) where is_public and item_key like 'filmes:%';
create index void_public_movie_counts on public.void_records(item_key,created_at) where is_public and item_key like 'filmes:%';
create table public.void_community_profiles(
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(length(trim(display_name)) between 1 and 50)
);
alter table public.void_community_profiles enable row level security;
revoke all on public.void_community_profiles from anon,authenticated;
grant select on public.void_community_profiles to anon,authenticated;
grant insert,update,delete on public.void_community_profiles to authenticated;
create policy public_identity on public.void_community_profiles for select to anon,authenticated using(true);
create policy own_identity_insert on public.void_community_profiles for insert to authenticated with check(user_id=(select auth.uid()));
create policy own_identity_update on public.void_community_profiles for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy own_identity_delete on public.void_community_profiles for delete to authenticated using(user_id=(select auth.uid()));
create table public.void_friendships(
 sender uuid not null references auth.users(id) on delete cascade,
 recipient uuid not null references auth.users(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','accepted')),
 created_at timestamptz not null default now(),
 primary key(sender,recipient),check(sender<>recipient)
);
create unique index void_friend_pair on public.void_friendships(least(sender,recipient),greatest(sender,recipient));
create index void_friend_recipient on public.void_friendships(recipient,status);
alter table public.void_friendships enable row level security;
revoke all on public.void_friendships from anon,authenticated;
grant select,delete on public.void_friendships to authenticated;
grant insert(sender,recipient),update(status) on public.void_friendships to authenticated;
create policy friends_read on public.void_friendships for select to authenticated using((select auth.uid()) in (sender,recipient));
create policy friends_request on public.void_friendships for insert to authenticated with check(sender=(select auth.uid()) and status='pending');
create policy friends_accept on public.void_friendships for update to authenticated using(recipient=(select auth.uid()) and status='pending') with check(recipient=(select auth.uid()) and status='accepted');
create policy friends_remove on public.void_friendships for delete to authenticated using((select auth.uid()) in(sender,recipient));

create view public.void_movie_reviews with(security_invoker=true) as
select r.user_id,r.item_key,r.payload->'item' as movie,(r.payload->>'nota')::numeric as rating,
case when r.payload->>'spoiler'='true' then 'Review com spoilers — abra a obra para avaliar.' else left(coalesce(r.payload->>'texto',''),180) end as excerpt,
r.updated_at,r.created_at,coalesce(p.display_name,'Pessoa do VOID') as display_name
from public.void_records r left join public.void_community_profiles p using(user_id)
where r.is_public and r.item_key like 'filmes:%';

create view public.void_movie_stats with(security_invoker=true) as
select item_key,(array_agg(movie order by updated_at desc))[1] movie,
count(*) total,avg(rating) average,stddev_pop(rating) deviation,
count(*) filter(where created_at>=now()-interval '7 days') recent
from public.void_movie_reviews group by item_key;
grant select on public.void_movie_reviews,public.void_movie_stats to anon,authenticated;

create function public.void_movie_feed(section text) returns jsonb
language sql stable security invoker set search_path='' as $$
select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (
 select movie,average,total,deviation,recent from public.void_movie_stats
 where (section='trending' and recent>0)
 or(section='gems' and total between 2 and 20 and average>=4)
 or(section='divided' and total>=5 and deviation>=1)
 order by case when section='trending' then recent when section='gems' then average else deviation end desc,total desc,item_key
 limit 20
) t;
$$;
create function public.void_friend_movies() returns jsonb
language sql stable security invoker set search_path='' as $$
select jsonb_build_object('friendCount',(select count(*) from public.void_friendships where status='accepted' and (select auth.uid()) in(sender,recipient)),
'movies',coalesce((select jsonb_agg(to_jsonb(t)) from (
select distinct on(r.item_key) r.movie,r.rating,r.user_id,r.display_name,r.updated_at
from public.void_movie_reviews r where r.user_id in(
select case when sender=(select auth.uid()) then recipient else sender end from public.void_friendships
where status='accepted' and (select auth.uid()) in(sender,recipient))
order by r.item_key,r.updated_at desc limit 60
) t),'[]'::jsonb));
$$;
-- Preference calculation includes only the caller's records, even when public rows are visible.
create function public.void_movie_preferences() returns jsonb
language sql stable security invoker set search_path='' as $$
with mine as(select payload from public.void_records where user_id=(select auth.uid()) and kind='review' and item_key like 'filmes:%' and payload is not null),
genres as(select g.value genre,count(*) n from mine cross join lateral jsonb_array_elements_text(
case when jsonb_typeof(payload->'item'->'genreIds')='array' then payload->'item'->'genreIds' else '[]'::jsonb end) g
where (payload->>'nota')::numeric>=4 and g.value ~ '^[0-9]+$' group by g.value order by n desc,g.value limit 3)
select jsonb_build_object('count',(select count(*) from mine),'genres',coalesce((select jsonb_agg(genre) from genres),'[]'::jsonb),
'excluded',coalesce((select jsonb_agg(payload->'item'->>'id') from mine),'[]'::jsonb));
$$;
revoke all on function public.void_movie_feed(text),public.void_friend_movies(),public.void_movie_preferences() from public,anon,authenticated;
grant execute on function public.void_movie_feed(text) to anon,authenticated;
grant execute on function public.void_friend_movies(),public.void_movie_preferences() to authenticated;
commit;
