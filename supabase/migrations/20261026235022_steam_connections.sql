-- Only the server may attest ownership; client roles cannot insert a SteamID.
create table public.void_steam_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  steam_id text not null unique check (steam_id ~ '^7656119[0-9]{10}$'),
  connected_at timestamptz not null default now()
);
create table public.void_steam_challenges (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  steam_id text check (steam_id ~ '^7656119[0-9]{10}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes'
);
alter table public.void_steam_connections enable row level security;
alter table public.void_steam_challenges enable row level security;
revoke all on public.void_steam_connections, public.void_steam_challenges from public, anon, authenticated;
grant select on public.void_steam_connections to authenticated;
create policy steam_connection_owner_read on public.void_steam_connections
  for select to authenticated using ((select auth.uid()) = user_id);
create policy steam_challenge_server_only on public.void_steam_challenges
  for all to service_role using (true) with check (true);
grant select, insert, update, delete on public.void_steam_connections, public.void_steam_challenges to service_role;

-- A single transaction serializes connect/disconnect and consumes a verified challenge once.
create function public.void_steam_connection_action(p_action text, p_user_id uuid, p_hash text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_steam_id text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 817));
  if p_action = 'start' then
    if exists(select 1 from public.void_steam_connections where user_id = p_user_id) then
      raise exception 'ALREADY_CONNECTED';
    end if;
    if exists(select 1 from public.void_steam_challenges where user_id = p_user_id and created_at > now() - interval '10 seconds') then
      raise exception 'RATE_LIMIT';
    end if;
    insert into public.void_steam_challenges(user_id,token_hash) values(p_user_id,p_hash)
      on conflict(user_id) do update set token_hash=excluded.token_hash,steam_id=null,created_at=now(),expires_at=now()+interval '10 minutes';
  elsif p_action = 'complete' then
    delete from public.void_steam_challenges where user_id=p_user_id and token_hash=p_hash and expires_at>now() and steam_id is not null
      returning steam_id into v_steam_id;
    if v_steam_id is null then raise exception 'INVALID_FLOW'; end if;
    insert into public.void_steam_connections(user_id,steam_id) values(p_user_id,v_steam_id);
  elsif p_action = 'disconnect' then
    delete from public.void_steam_challenges where user_id=p_user_id;
    delete from public.void_steam_connections where user_id=p_user_id;
  else raise exception 'INVALID_FLOW';
  end if;
end;
$$;
revoke all on function public.void_steam_connection_action(text,uuid,text) from public,anon,authenticated;
grant execute on function public.void_steam_connection_action(text,uuid,text) to service_role;
