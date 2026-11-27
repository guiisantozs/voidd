begin;
create table void_private.provider_budgets (
  scope text not null,
  period text not null check (period in ('minute','day')),
  bucket timestamptz not null,
  n integer not null check (n >= 0),
  primary key (scope,period)
);
alter table void_private.provider_budgets enable row level security;
revoke all on void_private.provider_budgets from public,anon,authenticated;

-- Internal function only. A transaction-level lock serializes every reservation
-- for this provider across instances; denied requests do not consume credits.
create function void_private.reserve_provider_budget(p_scope text,p_minute_limit integer,p_daily_limit integer)
returns integer language plpgsql security definer set search_path='' as $$
declare at_time timestamptz:=clock_timestamp(); minute_bucket timestamptz;
  day_bucket timestamptz; minute_used integer; day_used integer;
begin
  if p_scope is null or p_scope not in ('tmdb','rawg','igdb','twitch','anilist','fanart','jikan','steam')
    or p_minute_limit is null or p_minute_limit not between 1 and 100000
    or p_daily_limit is null or p_daily_limit not between 1 and 10000000
  then raise exception 'INVALID_BUDGET' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('void-provider-budget:'||p_scope,0));
  at_time:=clock_timestamp();
  minute_bucket:=date_trunc('minute',at_time);
  day_bucket:=date_trunc('day',at_time,'UTC');
  select n into minute_used from void_private.provider_budgets where scope=p_scope and period='minute' and bucket=minute_bucket;
  select n into day_used from void_private.provider_budgets where scope=p_scope and period='day' and bucket=day_bucket;
  if coalesce(day_used,0)>=p_daily_limit then return greatest(1,ceil(extract(epoch from day_bucket+interval '1 day'-at_time))::integer);end if;
  if coalesce(minute_used,0)>=p_minute_limit then return greatest(1,ceil(extract(epoch from minute_bucket+interval '1 minute'-at_time))::integer);end if;
  insert into void_private.provider_budgets as b values(p_scope,'minute',minute_bucket,1),(p_scope,'day',day_bucket,1)
  on conflict(scope,period) do update set bucket=excluded.bucket,n=case when b.bucket=excluded.bucket then b.n+1 else 1 end;
  return 0;
end;$$;
revoke all on function void_private.reserve_provider_budget(text,integer,integer) from public,anon,authenticated;
grant execute on function void_private.reserve_provider_budget(text,integer,integer) to service_role;
create function public.void_reserve_provider_budget(p_scope text,p_minute_limit integer,p_daily_limit integer)
returns integer language sql security invoker set search_path='' as $$
  select void_private.reserve_provider_budget(p_scope,p_minute_limit,p_daily_limit);
$$;
revoke all on function public.void_reserve_provider_budget(text,integer,integer) from public,anon,authenticated;
grant execute on function public.void_reserve_provider_budget(text,integer,integer) to service_role;
commit;
