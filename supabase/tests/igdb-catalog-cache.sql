begin;
do $$ begin
 if not (select relrowsecurity from pg_class where oid='public.void_game_catalog_cache'::regclass) then raise exception 'Cache must have RLS';end if;
 if has_table_privilege('anon','public.void_game_catalog_cache','select') or has_table_privilege('authenticated','public.void_game_catalog_cache','insert') or has_table_privilege('authenticated','public.void_game_catalog_cache','update') then raise exception 'Client role may access server cache';end if;
 if not has_table_privilege('service_role','public.void_game_catalog_cache','select,insert,update,delete') then raise exception 'Server cache grants missing';end if;
end $$;
set local role service_role;
insert into public.void_game_catalog_cache(cache_key,value,expires_at) values(repeat('e',64),'{"fixture":"void-igdb-rls"}',now()+interval '1 hour');
do $$ begin
 if not exists(select 1 from public.void_game_catalog_cache where cache_key=repeat('e',64) and value->>'fixture'='void-igdb-rls') then raise exception 'Server cache unavailable';end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform count(*) from public.void_game_catalog_cache;raise exception 'Anonymous read unexpectedly allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role authenticated;
do $$ begin
 begin insert into public.void_game_catalog_cache(cache_key,value,expires_at) values(repeat('f',64),'{}',now());raise exception 'Client write unexpectedly allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
