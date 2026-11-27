begin;

-- No backfill: existing records (including finished games) keep their payloads,
-- status and updated_at. These nullable columns are private with kind=library.
alter table public.void_records
  add column if not exists started_at timestamptz default null,
  add column if not exists finished_at timestamptz default null;

comment on column public.void_records.started_at is 'Optional personal game start timestamp for library records. No historical dates inferred.';
comment on column public.void_records.finished_at is 'Optional personal game completion timestamp for library records. No historical dates inferred.';

-- Keep the existing payload-based offline queue and older clients compatible.
-- The application performs status transitions; this trigger mirrors their dates
-- into columns and mirrors direct column edits back into the synced payload.
-- It never invents dates when an older client sends a status without dates.
create or replace function void_private.sync_game_journey_dates()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  started_changed boolean := false;
  finished_changed boolean := false;
begin
  if new.kind <> 'library' or new.payload is null then
    new.started_at := null;
    new.finished_at := null;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    started_changed := new.started_at is distinct from old.started_at;
    finished_changed := new.finished_at is distinct from old.finished_at;
  end if;

  if new.payload ? 'started_at'
    and jsonb_typeof(new.payload->'started_at') not in ('string', 'null') then
    raise exception 'Invalid started_at' using errcode = '22007';
  end if;
  if new.payload ? 'finished_at'
    and jsonb_typeof(new.payload->'finished_at') not in ('string', 'null') then
    raise exception 'Invalid finished_at' using errcode = '22007';
  end if;

  if not started_changed then
    if new.payload ? 'started_at' then
      new.started_at := (new.payload->>'started_at')::timestamptz;
    elsif tg_op = 'UPDATE' then
      new.started_at := old.started_at;
    end if;
  end if;
  if not finished_changed then
    if new.payload ? 'finished_at' then
      new.finished_at := (new.payload->>'finished_at')::timestamptz;
    elsif tg_op = 'UPDATE' then
      new.finished_at := old.finished_at;
    end if;
  end if;

  -- Do not add null keys to legacy INSERTs: an upsert's excluded payload must
  -- not accidentally erase the existing row's dates on its UPDATE path.
  if tg_op = 'UPDATE' or new.payload ? 'started_at' or new.payload ? 'finished_at'
    or new.started_at is not null or new.finished_at is not null then
    new.payload := new.payload || jsonb_build_object(
      'started_at', new.started_at, 'finished_at', new.finished_at);
  end if;
  return new;
end;
$$;

revoke all on function void_private.sync_game_journey_dates() from public, anon, authenticated;
create trigger game_journey_dates_sync before insert or update on public.void_records
for each row execute function void_private.sync_game_journey_dates();

-- Keep all existing grants and policies. In particular library.is_public stays
-- false, and records_insert / records_update still require auth.uid()=user_id.
commit;
