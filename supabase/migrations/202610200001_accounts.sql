begin;

create table public.void_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 50),
  bio text not null default '' check (char_length(bio) <= 240),
  updated_at timestamptz not null default now()
);

create table public.void_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('review', 'library')),
  item_key text not null,
  payload jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, item_key),
  constraint valid_item_key check (
    (kind = 'review' and item_key ~ '^(filmes|series|animes|jogos):[1-9][0-9]*$')
    or (kind = 'library' and item_key ~ '^[1-9][0-9]*$')
  ),
  constraint payload_size check (payload is null or octet_length(payload::text) <= 100000),
  constraint payload_shape check (payload is null or (jsonb_typeof(payload) = 'object'
    and jsonb_typeof(payload->'item') = 'object'
    and jsonb_typeof(payload->'item'->'titulo') = 'string'
    and case when kind = 'library' then
      payload->>'status' in ('want', 'playing', 'finished', 'paused')
      and payload->'item'->>'categoria' = 'jogos'
      and payload->'item'->>'id' = item_key
    else
      (payload->>'nota')::numeric between 0.5 and 5
      and mod((payload->>'nota')::numeric * 2, 1) = 0
      and char_length(coalesce(payload->>'texto', '')) <= 2000
      and concat(payload->'item'->>'categoria', ':', payload->'item'->>'id') = item_key
    end) is true)
);

create function public.void_touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger void_profiles_updated before update on public.void_profiles
for each row execute function public.void_touch_updated_at();
create trigger void_records_updated before update on public.void_records
for each row execute function public.void_touch_updated_at();

alter table public.void_profiles enable row level security;
alter table public.void_records enable row level security;
revoke all on public.void_profiles, public.void_records from anon, authenticated;
grant select, insert, update on public.void_profiles, public.void_records to authenticated;

create policy profiles_read on public.void_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy profiles_insert on public.void_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy profiles_update on public.void_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy records_read on public.void_records for select to authenticated using ((select auth.uid()) = user_id);
create policy records_insert on public.void_records for insert to authenticated with check ((select auth.uid()) = user_id);
create policy records_update on public.void_records for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- payload NULL é um marcador de remoção: evita que outra cópia ressuscite um status removido.
-- Perfis e avaliações são privados nesta primeira versão.
commit;
