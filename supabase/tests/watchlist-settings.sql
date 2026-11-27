-- DEVELOPMENT ONLY: isolated synthetic accounts; no production fixtures.
begin;
create temp table watch_ids as select gen_random_uuid() a,gen_random_uuid() b,gen_random_uuid() c;
grant select on watch_ids to authenticated,anon;
insert into auth.users(id) select a from watch_ids union all select b from watch_ids union all select c from watch_ids;
insert into public.void_community_profiles(user_id,username,display_name,visibility)
select id,'watch_'||substr(md5(id::text),1,12),'Fixture','public' from watch_ids cross join lateral(values(a),(b),(c)) t(id);
create temp table watch_list(id uuid);grant select,insert on watch_list to authenticated,anon;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select a::text from watch_ids),true);
insert into public.void_records(user_id,kind,item_key,payload) values
(auth.uid(),'watchlist','123','{"item":{"id":"123","categoria":"filmes","titulo":"Filme anterior","poster":"https://example.invalid/p.jpg"}}'),
(auth.uid(),'watchlist','124',null),
(auth.uid(),'library','125','{"item":{"titulo":"Registro privado"}}');
insert into watch_list select public.void_watchlist_edit();
do $$declare lid uuid:=(select id from watch_list);begin
 if public.void_watchlist_edit()<>lid then raise exception 'Default duplicated';end if;
 if public.void_list_detail(lid)->>'visibility'<>'private' then raise exception 'Default published';end if;
 if jsonb_array_length(public.void_list_detail(lid)->'items')<>1 then raise exception 'Legacy movies lost or tombstone included';end if;
 if exists(select 1 from public.list_items where list_id=lid) then raise exception 'Movies duplicated';end if;
 perform public.void_list_write(lid,'{"title":"Meu cinema","description":"Minha bio","visibility":"public","ranked":true,"media_types":["jogos"]}',null,(select updated_at from public.lists where lists.id=lid));
 if public.void_list_detail(lid)->>'title'<>'Meu cinema' or public.void_list_detail(lid)->>'description'<>'Minha bio' or public.void_list_detail(lid)->'media_types'<>'["filmes"]'::jsonb or (public.void_list_detail(lid)->>'ranked')::boolean then raise exception 'Edit / fixed film category failed';end if;
 if jsonb_array_length(public.void_lists_page_v2('mine')->'rows')<>0 then raise exception 'Default duplicated on owner page';end if;
 begin delete from public.lists where id=lid;raise exception 'Default deleted';exception when raise_exception then if sqlerrm<>'STANDARD_LIST' then raise;end if;end;
 begin perform public.void_list_item_toggle(lid,'{"media_type":"filmes","external_id":"789","snapshot":{"id":"789","categoria":"filmes","titulo":"Forbidden duplicate"}}',true);raise exception 'Item duplicated into default';exception when raise_exception then if sqlerrm<>'STANDARD_LIST' then raise;end if;end;
end;$$;
select set_config('request.jwt.claim.sub',(select b::text from watch_ids),true);
do $$declare lid uuid:=(select id from watch_list);begin
 if jsonb_array_length(public.void_list_detail(lid)->'items')<>1 then raise exception 'Published default inaccessible';end if;
 if (select count(*) from public.void_records)<>1 then raise exception 'Private unrelated record exposed';end if;
 begin perform public.void_list_write(lid,'{"title":"Invader","visibility":"public","ranked":false}',null,(select updated_at from public.lists where id=lid));raise exception 'Foreign edited';exception when insufficient_privilege then null;end;
end;$$;
reset role;
-- Live additions/removals use the original source, never a copied snapshot.
insert into public.void_records(user_id,kind,item_key,payload) select a,'watchlist','456','{"item":{"id":"456","categoria":"filmes","titulo":"Filme novo"}}'::jsonb from watch_ids;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$begin if jsonb_array_length(public.void_list_detail((select id from watch_list))->'items')<>2 then raise exception 'Public live source stale';end if;end;$$;
reset role;
update public.void_records set payload=null where user_id=(select a from watch_ids) and item_key='123';
update public.void_community_profiles set visibility='private' where user_id=(select a from watch_ids);
set local role authenticated;
select set_config('request.jwt.claim.sub',(select c::text from watch_ids),true);
do $$begin if public.void_list_detail((select id from watch_list)) is not null or exists(select 1 from public.void_records) then raise exception 'Private profile bypassed';end if;end;$$;
reset role;
update public.void_community_profiles set visibility='public' where user_id=(select a from watch_ids);
update public.lists set visibility='private' where id=(select id from watch_list);
set local role authenticated;
select set_config('request.jwt.claim.sub',(select b::text from watch_ids),true);
do $$begin if public.void_list_detail((select id from watch_list)) is not null or exists(select 1 from public.void_records) then raise exception 'Private list bypassed';end if;end;$$;
select set_config('request.jwt.claim.sub',(select a::text from watch_ids),true);
do $$begin if jsonb_array_length(public.void_list_detail((select id from watch_list))->'items')<>1 then raise exception 'Tombstone not respected';end if;end;$$;
rollback;
