begin;
create table public.void_anime_cache (
 cache_key text primary key check(length(cache_key) between 1 and 240),
 payload jsonb, fetched_at timestamptz, ttl_seconds integer not null default 2592000 check(ttl_seconds between 60 and 5184000),
 expires_at timestamptz, refresh_token uuid, refresh_until timestamptz
);
alter table public.void_anime_cache enable row level security;
revoke all on public.void_anime_cache from public,anon,authenticated;
grant select,insert,update,delete on public.void_anime_cache to service_role;
create policy anime_cache_server on public.void_anime_cache for all to service_role using(true) with check(true);
create index anime_cache_fetched on public.void_anime_cache(fetched_at);
comment on table public.void_anime_cache is 'Server-only public anime metadata, translations and resource refresh leases. Never user records or secrets.';

create function public.void_anime_cache_claim(p_key text,p_token uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare claimed text;
begin
 insert into public.void_anime_cache(cache_key,refresh_token,refresh_until)
 values(p_key,p_token,clock_timestamp()+interval '60 seconds')
 on conflict(cache_key) do update set refresh_token=excluded.refresh_token,refresh_until=excluded.refresh_until
 where public.void_anime_cache.refresh_until is null or public.void_anime_cache.refresh_until<clock_timestamp()
 returning cache_key into claimed;
 return claimed is not null;
end;$$;

create table public.void_anime_api_state (
 provider text primary key check(provider='jikan'), starts timestamptz[] not null default '{}', blocked_until timestamptz
);
insert into public.void_anime_api_state(provider) values('jikan');
alter table public.void_anime_api_state enable row level security;
revoke all on public.void_anime_api_state from public,anon,authenticated;
grant select,update on public.void_anime_api_state to service_role;
create policy anime_api_server on public.void_anime_api_state for all to service_role using(true) with check(true);
-- Atomically reserve actual starts across server instances. Rolling minute,
-- minimum 350 ms apart; a rejected reservation spends no upstream request.
create function public.void_anime_api_slot(p_block_seconds integer default 0) returns integer
language plpgsql security invoker set search_path='' as $$
declare r public.void_anime_api_state;stamp timestamptz:=clock_timestamp();recent timestamptz[];wait_ms integer:=0;
begin
 select * into r from public.void_anime_api_state where provider='jikan' for update;
 if p_block_seconds>0 then
  update public.void_anime_api_state set blocked_until=greatest(coalesce(blocked_until,stamp),stamp+make_interval(secs=>least(p_block_seconds,86400))) where provider='jikan';return 0;
 end if;
 select coalesce(array_agg(s order by s),'{}') into recent from unnest(r.starts)s where s>stamp-interval '60 seconds';
 if r.blocked_until>stamp then wait_ms:=ceil(extract(epoch from r.blocked_until-stamp)*1000);
 elsif cardinality(recent)>=60 then wait_ms:=ceil(extract(epoch from recent[1]+interval '60 seconds'-stamp)*1000);
 elsif cardinality(recent)>0 then wait_ms:=greatest(0,ceil(extract(epoch from recent[cardinality(recent)]+interval '0.35 seconds'-stamp)*1000));end if;
 if wait_ms=0 then update public.void_anime_api_state set starts=array_append(recent,stamp) where provider='jikan';end if;
 return wait_ms;
end;$$;
revoke all on function public.void_anime_cache_claim(text,uuid),public.void_anime_api_slot(integer) from public,anon,authenticated;
grant execute on function public.void_anime_cache_claim(text,uuid),public.void_anime_api_slot(integer) to service_role;
notify pgrst,'reload schema';
commit;
