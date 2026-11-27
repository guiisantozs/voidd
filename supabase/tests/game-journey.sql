-- Development database only. Fixtures are rolled back; never run on real users.
begin;
create temp table journey_ids as select gen_random_uuid() a, gen_random_uuid() b;
grant select on journey_ids to authenticated,anon;
insert into auth.users(id) select a from journey_ids union all select b from journey_ids;

set local role authenticated;
select set_config('request.jwt.claim.sub',(select a::text from journey_ids),true);
insert into public.void_records(user_id,kind,item_key,payload)
values(auth.uid(),'library','900001','{"item":{"id":900001,"categoria":"jogos","titulo":"Journey fixture"},"status":"playing","started_at":"2026-10-12T12:00:00Z","finished_at":null}');
do $$begin
 if not exists(select 1 from public.void_records where item_key='900001' and started_at='2026-10-12T12:00:00Z' and finished_at is null) then raise exception 'Payload dates did not reach columns'; end if;
end$$;
update public.void_records set payload=payload||'{"status":"finished","finished_at":"2026-10-20T12:00:00Z"}' where item_key='900001';
do $$begin
 if not exists(select 1 from public.void_records where item_key='900001' and finished_at='2026-10-20T12:00:00Z') then raise exception 'Finish timestamp missing'; end if;
end$$;
-- An older client's upsert must not remove the dates already synced.
insert into public.void_records(user_id,kind,item_key,payload)
values(auth.uid(),'library','900001','{"item":{"id":900001,"categoria":"jogos","titulo":"Legacy edit"},"status":"finished"}')
on conflict(user_id,kind,item_key) do update set payload=excluded.payload;
do $$begin
 if not exists(select 1 from public.void_records where item_key='900001' and started_at='2026-10-12T12:00:00Z' and finished_at='2026-10-20T12:00:00Z') then raise exception 'Legacy upsert erased dates'; end if;
end$$;
update public.void_records set started_at='2020-01-02T12:00:00Z',finished_at=null where item_key='900001';
do $$begin
 if not exists(select 1 from public.void_records where item_key='900001' and (payload->>'started_at')::timestamptz=started_at and payload->>'finished_at' is null) then raise exception 'Column edits not mirrored into payload'; end if;
 begin
  update public.void_records set payload=jsonb_set(payload,'{finished_at}','"not-a-date"') where item_key='900001';
  raise exception 'Invalid timestamp accepted';
 exception when invalid_datetime_format then null; end;
end$$;

select set_config('request.jwt.claim.sub',(select b::text from journey_ids),true);
do $$declare n integer;begin
 if exists(select 1 from public.void_records where item_key='900001') then raise exception 'Other account read private dates'; end if;
 update public.void_records set finished_at=now() where item_key='900001';get diagnostics n=row_count;
 if n<>0 then raise exception 'Other account changed private dates'; end if;
 begin
  insert into public.void_records(user_id,kind,item_key,payload,started_at) select a,'library','900002','{"item":{"id":900002,"categoria":"jogos","titulo":"Forbidden"},"status":"want"}',now() from journey_ids;
  raise exception 'Cross-account insert accepted';
 exception when insufficient_privilege then null;end;
end$$;
reset role;
set local role anon;
do $$begin if exists(select 1 from public.void_records where kind='library' and item_key='900001') then raise exception 'Anonymous read private dates';end if;end$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select a::text from journey_ids),true);
update public.void_records set payload=null where item_key='900001';
do $$begin
 if not exists(select 1 from public.void_records where item_key='900001' and payload is null and started_at is null and finished_at is null) then raise exception 'Tombstone/date clearing failed'; end if;
end$$;
reset role;
rollback;
