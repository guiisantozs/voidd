-- Development database only. All fixture users and links are rolled back.
begin;
create temp table steam_ids as select gen_random_uuid() a, gen_random_uuid() b, gen_random_uuid() c;
grant select on steam_ids to authenticated,service_role;
insert into auth.users(id) select a from steam_ids union all select b from steam_ids union all select c from steam_ids;

set local role service_role;
select public.void_steam_connection_action('start',a,repeat('a',64)) from steam_ids;
do $$begin
  begin
    perform public.void_steam_connection_action('complete',(select a from steam_ids),repeat('a',64));
    raise exception 'Unverified challenge accepted';
  exception when raise_exception then if sqlerrm <> 'INVALID_FLOW' then raise; end if; end;
  begin
    perform public.void_steam_connection_action('start',(select a from steam_ids),repeat('b',64));
    raise exception 'Cooldown bypassed';
  exception when raise_exception then if sqlerrm <> 'RATE_LIMIT' then raise; end if; end;
end$$;
update public.void_steam_challenges set steam_id='76561198000000001' where user_id=(select a from steam_ids);
do $$begin
  begin
    perform public.void_steam_connection_action('complete',(select b from steam_ids),repeat('a',64));
    raise exception 'Another VOID account consumed challenge';
  exception when raise_exception then if sqlerrm <> 'INVALID_FLOW' then raise; end if; end;
end$$;
select public.void_steam_connection_action('complete',a,repeat('a',64)) from steam_ids;
do $$begin
  begin
    perform public.void_steam_connection_action('complete',(select a from steam_ids),repeat('a',64));
    raise exception 'Challenge replayed';
  exception when raise_exception then if sqlerrm <> 'INVALID_FLOW' then raise; end if; end;
end$$;
select public.void_steam_connection_action('start',b,repeat('b',64)) from steam_ids;
update public.void_steam_challenges set steam_id='76561198000000001' where user_id=(select b from steam_ids);
do $$begin
  begin
    perform public.void_steam_connection_action('complete',(select b from steam_ids),repeat('b',64));
    raise exception 'Steam account linked twice';
  exception when unique_violation then null; end;
end$$;
select public.void_steam_connection_action('start',c,repeat('c',64)) from steam_ids;
update public.void_steam_challenges set steam_id='76561198000000003',expires_at=now()-interval '1 second' where user_id=(select c from steam_ids);
do $$begin
  begin
    perform public.void_steam_connection_action('complete',(select c from steam_ids),repeat('c',64));
    raise exception 'Expired flow accepted';
  exception when raise_exception then if sqlerrm <> 'INVALID_FLOW' then raise; end if; end;
end$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select a::text from steam_ids),true);
do $$begin
  if (select count(*) from public.void_steam_connections) <> 1 then raise exception 'Owner cannot read connection'; end if;
  begin
    insert into public.void_steam_connections(user_id,steam_id) values(auth.uid(),'76561198000000009');
    raise exception 'Client forged Steam ownership';
  exception when insufficient_privilege then null; end;
  begin
    update public.void_steam_connections set steam_id='76561198000000009';
    raise exception 'Client changed Steam ownership';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.void_steam_connections;
    raise exception 'Client bypassed serialized disconnect';
  exception when insufficient_privilege then null; end;
  begin
    perform public.void_steam_connection_action('start',auth.uid(),repeat('d',64));
    raise exception 'Client called privileged RPC';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.void_steam_challenges;
    raise exception 'Client read pending challenges';
  exception when insufficient_privilege then null; end;
end$$;
select set_config('request.jwt.claim.sub',(select b::text from steam_ids),true);
do $$begin
  if exists(select 1 from public.void_steam_connections) then raise exception 'Cross-account read'; end if;
end$$;
reset role;
set local role anon;
do $$begin
  begin perform * from public.void_steam_connections; raise exception 'Anonymous read';
  exception when insufficient_privilege then null; end;
end$$;
reset role;
set local role service_role;
select public.void_steam_connection_action('disconnect',b) from steam_ids;
select public.void_steam_connection_action('disconnect',a) from steam_ids;
do $$begin
  if exists(select 1 from public.void_steam_connections where user_id=(select a from steam_ids)) then raise exception 'Disconnect failed'; end if;
  if exists(select 1 from public.void_steam_challenges where user_id=(select b from steam_ids)) then raise exception 'Disconnect kept pending flow'; end if;
end$$;
reset role;
rollback;
