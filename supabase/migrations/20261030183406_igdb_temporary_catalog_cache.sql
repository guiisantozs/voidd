begin;
create table public.void_game_catalog_cache (
 cache_key text primary key check(cache_key ~ '^[a-f0-9]{64}$'),
 value jsonb not null,
 expires_at timestamptz not null,
 updated_at timestamptz not null default now()
);
create index void_game_catalog_cache_age on public.void_game_catalog_cache(updated_at);
alter table public.void_game_catalog_cache enable row level security;
revoke all on public.void_game_catalog_cache from public, anon, authenticated;
grant select,insert,update,delete on public.void_game_catalog_cache to service_role;
comment on table public.void_game_catalog_cache is 'Server-only cache of public IGDB metadata; no user records or credentials.';
commit;
