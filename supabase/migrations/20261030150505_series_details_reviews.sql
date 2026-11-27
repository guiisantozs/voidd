begin;
-- Additive, isolated migration. Existing movie/series reviews and privacy choices are untouched.
create table public.void_series_units(
 series_id bigint not null check(series_id>0),season_number integer not null check(season_number between 0 and 1000),episode_number integer not null default 0 check(episode_number between 0 and 10000),
 name text not null check(length(name) between 1 and 300),air_date date,checked_at timestamptz not null default now(),primary key(series_id,season_number,episode_number)
);
alter table public.void_series_units enable row level security;
revoke all on public.void_series_units from public,anon,authenticated;
grant select on public.void_series_units to anon,authenticated;
grant all on public.void_series_units to service_role;
create policy series_units_read on public.void_series_units for select to anon,authenticated using(true);
-- Only the trusted server registers TMDB release facts. Browsers cannot invent release dates.
create table public.void_series_unit_reviews(
 user_id uuid not null references auth.users(id) on delete cascade,series_id bigint not null,season_number integer not null,episode_number integer not null default 0,
 rating numeric not null check(rating between 0 and 5 and rating*10=trunc(rating*10)),text text not null default '' check(length(text)<=2000),spoiler boolean not null default false,is_public boolean not null default true,watched_on date not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(user_id,series_id,season_number,episode_number),
 foreign key(series_id,season_number,episode_number) references public.void_series_units(series_id,season_number,episode_number)
);
create index series_unit_public_reviews on public.void_series_unit_reviews(series_id,season_number,episode_number,updated_at desc) where is_public;
alter table public.void_series_unit_reviews enable row level security;
revoke all on public.void_series_unit_reviews from public,anon,authenticated;
grant select on public.void_series_unit_reviews to anon,authenticated;
grant insert(user_id,series_id,season_number,episode_number,rating,text,spoiler,is_public,watched_on),update(user_id,series_id,season_number,episode_number,rating,text,spoiler,is_public,watched_on),delete on public.void_series_unit_reviews to authenticated;
grant all on public.void_series_unit_reviews to service_role;
create policy series_unit_reviews_read on public.void_series_unit_reviews for select to anon,authenticated using(user_id=(select auth.uid()) or (is_public and void_private.can_view_profile(user_id)));
create policy series_unit_reviews_insert on public.void_series_unit_reviews for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.void_community_profiles p where p.user_id=(select auth.uid()) and p.username is not null) and exists(select 1 from public.void_series_units u where (u.series_id,u.season_number,u.episode_number)=(void_series_unit_reviews.series_id,void_series_unit_reviews.season_number,void_series_unit_reviews.episode_number) and u.air_date is not null and u.air_date<=(now() at time zone 'America/Sao_Paulo')::date and u.checked_at>=now()-interval '24 hours' and watched_on between u.air_date and (now() at time zone 'America/Sao_Paulo')::date));
create policy series_unit_reviews_update on public.void_series_unit_reviews for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(select 1 from public.void_series_units u where (u.series_id,u.season_number,u.episode_number)=(void_series_unit_reviews.series_id,void_series_unit_reviews.season_number,void_series_unit_reviews.episode_number) and u.air_date is not null and u.air_date<=(now() at time zone 'America/Sao_Paulo')::date and u.checked_at>=now()-interval '24 hours' and watched_on between u.air_date and (now() at time zone 'America/Sao_Paulo')::date));
create policy series_unit_reviews_delete on public.void_series_unit_reviews for delete to authenticated using(user_id=(select auth.uid()));
create trigger series_unit_review_updated before update on public.void_series_unit_reviews for each row execute function public.void_touch_updated_at();
create trigger series_unit_review_rate before insert or update on public.void_series_unit_reviews for each row execute function void_private.review_write_limit();
create table public.void_series_episode_progress(
 user_id uuid not null references auth.users(id) on delete cascade,series_id bigint not null,season_number integer not null,episode_number integer not null check(episode_number>0),updated_at timestamptz not null default now(),
 primary key(user_id,series_id,season_number,episode_number),foreign key(series_id,season_number,episode_number) references public.void_series_units(series_id,season_number,episode_number)
);
alter table public.void_series_episode_progress enable row level security;
revoke all on public.void_series_episode_progress from public,anon,authenticated;
grant select,delete on public.void_series_episode_progress to authenticated;
grant insert(user_id,series_id,season_number,episode_number),update(user_id,series_id,season_number,episode_number) on public.void_series_episode_progress to authenticated;
grant all on public.void_series_episode_progress to service_role;
create policy series_progress_read on public.void_series_episode_progress for select to authenticated using(user_id=(select auth.uid()));
create policy series_progress_insert on public.void_series_episode_progress for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.void_series_units u where (u.series_id,u.season_number,u.episode_number)=(void_series_episode_progress.series_id,void_series_episode_progress.season_number,void_series_episode_progress.episode_number) and u.air_date is not null and u.air_date<=(now() at time zone 'America/Sao_Paulo')::date and u.checked_at>=now()-interval '24 hours'));
create policy series_progress_update on public.void_series_episode_progress for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(select 1 from public.void_series_units u where (u.series_id,u.season_number,u.episode_number)=(void_series_episode_progress.series_id,void_series_episode_progress.season_number,void_series_episode_progress.episode_number) and u.air_date is not null and u.air_date<=(now() at time zone 'America/Sao_Paulo')::date and u.checked_at>=now()-interval '24 hours'));
create policy series_progress_delete on public.void_series_episode_progress for delete to authenticated using(user_id=(select auth.uid()));
create trigger series_progress_updated before update on public.void_series_episode_progress for each row execute function public.void_touch_updated_at();
create function public.void_series_unit_summary(target_series bigint) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(summary)),'[]'::jsonb) from (select season_number,episode_number,count(*) total,avg(rating) average from public.void_series_unit_reviews where series_id=target_series and is_public group by season_number,episode_number) summary;
$$;
revoke all on function public.void_series_unit_summary(bigint) from public,anon,authenticated;
grant execute on function public.void_series_unit_summary(bigint) to anon,authenticated;
-- Existing interactions now accept whole-series reviews; their FK, limits and RLS remain in force.
alter table public.void_review_likes drop constraint void_review_likes_item_key_check;
alter table public.void_review_likes add constraint void_review_likes_item_key_check check(item_key ~ '^(filmes|jogos|series):[1-9][0-9]*$');
alter table public.void_review_comments drop constraint void_review_comments_item_key_check;
alter table public.void_review_comments add constraint void_review_comments_item_key_check check(item_key ~ '^(filmes|jogos|series):[1-9][0-9]*$');
alter table public.void_review_reports drop constraint void_review_reports_item_key_check;
alter table public.void_review_reports add constraint void_review_reports_item_key_check check(item_key ~ '^(filmes|series):[1-9][0-9]*$');
notify pgrst,'reload schema';
commit;
