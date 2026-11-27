begin;
create table public.void_series_preferences(
 user_id uuid primary key references auth.users(id) on delete cascade,
 series_ids bigint[] not null,
 completed_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint series_preferences_three check((array_ndims(series_ids)=1 and array_lower(series_ids,1)=1 and cardinality(series_ids)=3 and array_position(series_ids,null) is null and 0<all(series_ids) and 9999999999>=all(series_ids) and series_ids[1]<>series_ids[2] and series_ids[1]<>series_ids[3] and series_ids[2]<>series_ids[3]) is true)
);
alter table public.void_series_preferences enable row level security;
revoke all on public.void_series_preferences from public,anon,authenticated;
grant select on public.void_series_preferences to authenticated;
grant insert(user_id,series_ids),update(user_id,series_ids),delete on public.void_series_preferences to authenticated;
grant select,insert,update,delete on public.void_series_preferences to service_role;
create policy series_preferences_read on public.void_series_preferences for select to authenticated using(user_id=(select auth.uid()));
create policy series_preferences_insert on public.void_series_preferences for insert to authenticated with check(user_id=(select auth.uid()));
create policy series_preferences_update on public.void_series_preferences for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy series_preferences_delete on public.void_series_preferences for delete to authenticated using(user_id=(select auth.uid()));
create trigger series_preferences_updated before update on public.void_series_preferences for each row execute function public.void_touch_updated_at();
commit;
