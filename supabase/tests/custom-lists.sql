-- DEVELOPMENT ONLY. Synthetic account and catalog identifiers; always rolled back.
begin;
create temp table list_test_ids as select gen_random_uuid() a,gen_random_uuid() b,gen_random_uuid() c;
grant select on list_test_ids to anon,authenticated;
insert into auth.users(id) select a from list_test_ids union all select b from list_test_ids union all select c from list_test_ids;
-- Auth triggers normally create these rows. ON CONFLICT also supports an isolated
-- Postgres harness with only the Auth/identity contract needed by this migration.
insert into public.void_community_profiles(user_id,display_name,username,visibility)
select u,'Teste listas','list_'||substr(md5(u::text),1,12),'public' from list_test_ids cross join lateral(values(a),(b),(c)) t(u)
on conflict(user_id) do update set username=excluded.username,visibility='public';
create temp table list_test_state(name text primary key,id uuid,version timestamptz);
grant select,insert,update on list_test_state to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select a::text from list_test_ids),true);
insert into list_test_state(name,id) values('public',public.void_list_write(null,'{"title":"<b>Universo</b>","description":"Olá","visibility":"public","ranked":true}',
'[{"media_type":"filmes","external_id":"99000001","note":"<b>Comentário</b>","snapshot":{"titulo":"Filme fixture","poster":"https://example.test/poster.jpg"}},{"media_type":"jogos","external_id":"99000001","snapshot":{"titulo":"Jogo fixture"}}]'));
insert into list_test_state(name,id) values('connections',public.void_list_write(null,'{"title":"Conexões","visibility":"connections","ranked":false}','[]'));
insert into list_test_state(name,id) values('private',public.void_list_write(null,'{"title":"Privada","visibility":"private","ranked":false}','[]'));
do $$declare d jsonb;v timestamptz;lid uuid:=(select id from list_test_state where name='public');begin
 d:=public.void_list_detail(lid);v:=(d->>'updated_at')::timestamptz;
 if d->>'title'<>'Universo' or d->'items'->0->>'note'<>'Comentário' or jsonb_array_length(d->'items')<>2 then raise exception 'Sanitization/mixed-media failed';end if;
 if jsonb_array_length(public.void_list_detail((select id from list_test_state where name='private'))->'items')<>0 then raise exception 'Idea not empty';end if;
 perform public.void_list_write(lid,'{"title":"Universo editado","visibility":"public","ranked":true}',null,v);
 begin perform public.void_list_write(lid,'{"title":"Stale","visibility":"private","ranked":false}',null,v);raise exception 'Stale version accepted';exception when sqlstate 'P0001' then if sqlerrm<>'LIST_CONFLICT' then raise;end if;end;
 begin perform public.void_list_write(lid,'{"title":"Duplicate","visibility":"public","ranked":false}',
 '[{"media_type":"filmes","external_id":"1","snapshot":{"titulo":"A"}},{"media_type":"filmes","external_id":"1","snapshot":{"titulo":"A"}}]',(public.void_list_detail(lid)->>'updated_at')::timestamptz);raise exception 'Duplicate accepted';exception when sqlstate 'P0001' then if sqlerrm<>'INVALID_ITEMS' then raise;end if;end;
 if public.void_list_detail(lid)->>'title'<>'Universo editado' then raise exception 'Failed save not atomic';end if;
end$$;
-- B follows A, C starts as a stranger.
select set_config('request.jwt.claim.sub',(select b::text from list_test_ids),true);
insert into public.follows(follower_id,followed_id) select b,a from list_test_ids;
do $$declare lid uuid:=(select id from list_test_state where name='public');begin
 if public.void_list_detail(lid) is null or public.void_list_detail((select id from list_test_state where name='connections')) is null or public.void_list_detail((select id from list_test_state where name='private')) is not null then raise exception 'Follower visibility failed';end if;
 begin perform public.void_list_write(lid,'{"title":"Hacked","visibility":"public","ranked":false}',null,now());raise exception 'Other owner edited list';exception when insufficient_privilege then null;end;
 begin perform public.void_list_item_toggle(lid,'{"media_type":"filmes","external_id":"9","snapshot":{"titulo":"No"}}',true);raise exception 'Other owner edited items';exception when insufficient_privilege then null;end;
end$$;
insert into public.list_likes(list_id,user_id) select id,auth.uid() from list_test_state where name='public';
insert into public.list_saves(list_id,user_id) select id,auth.uid() from list_test_state where name='public';
do $$begin
 begin insert into public.list_likes(list_id,user_id) select id,auth.uid() from list_test_state where name='public';raise exception 'Duplicate like';exception when unique_violation then null;end;
 if not(public.void_list_detail((select id from list_test_state where name='public'))->>'saved')::boolean then raise exception 'Save failed';end if;
 if jsonb_array_length(public.void_lists_page('saved')->'rows')<>1 then raise exception 'Saved page failed';end if;
 if jsonb_array_length(public.void_lists_page('following')->'rows')<>2 or jsonb_array_length(public.void_lists_page('profile','recent',(select a from list_test_ids))->'rows')<>2 then raise exception 'Following/profile list filter failed';end if;
 if (public.void_lists_page('saved')->'rows'->0->>'likes')::int<>1 or jsonb_array_length(public.void_lists_page('saved')->'rows'->0->'cover')<>2 then raise exception 'Cover/count aggregation failed';end if;
end$$;
select set_config('request.jwt.claim.sub',(select c::text from list_test_ids),true);
do $$begin
 if public.void_list_detail((select id from list_test_state where name='connections')) is not null then raise exception 'Stranger read connections';end if;
 if exists(select 1 from public.list_saves where user_id<>(select auth.uid())) then raise exception 'Other saved collection leaked';end if;
end$$;
reset role;
insert into public.void_friendships(sender,recipient,status) select a,c,'accepted' from list_test_ids;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select c::text from list_test_ids),true);
do $$begin if public.void_list_detail((select id from list_test_state where name='connections')) is null then raise exception 'Accepted friend cannot read connections list';end if;end$$;
select set_config('request.jwt.claim.sub',(select a::text from list_test_ids),true);
-- A full 200-item save, edit and reorder must succeed, including ON CONFLICT.
do $$declare entries jsonb;lid uuid;v timestamptz;begin
 select jsonb_agg(jsonb_build_object('media_type','animes','external_id',n::text,'snapshot',jsonb_build_object('titulo','Fixture '||n),'note','Nota '||n) order by n) into entries from generate_series(1,200)n;
 lid:=public.void_list_write(null,'{"title":"200 obras","visibility":"private","ranked":true}',entries);
 insert into list_test_state values('full',lid,null);
 v:=(public.void_list_detail(lid)->>'updated_at')::timestamptz;
 perform public.void_list_write(lid,'{"title":"200 reordenadas","visibility":"private","ranked":true}',(select jsonb_agg(e order by e->>'external_id' desc) from jsonb_array_elements(entries)e),v);
 if jsonb_array_length(public.void_list_detail(lid)->'items')<>200 then raise exception 'Full save lost items';end if;
 begin perform public.void_list_item_toggle(lid,'{"media_type":"filmes","external_id":"999","snapshot":{"titulo":"Excesso"}}',true);raise exception '201st item accepted';exception when sqlstate 'P0001' then if sqlerrm<>'LIST_LIMIT' then raise;end if;end;
 perform public.void_list_item_toggle(lid,'{"media_type":"animes","external_id":"1","snapshot":{"titulo":"Fixture 1"}}',false);
 perform public.void_list_item_toggle(lid,'{"media_type":"filmes","external_id":"999","snapshot":{"titulo":"Novo"}}',true);
 if jsonb_array_length(public.void_list_detail(lid)->'items')<>200 then raise exception 'Quick toggle failed';end if;
end$$;
-- Constraints remain enforced for direct table writes outside the UI.
do $$begin
 begin insert into public.lists(owner_id,title) values(auth.uid(),repeat('x',81));raise exception 'Long title accepted';exception when check_violation then null;end;
 begin insert into public.list_items(list_id,media_type,external_id,position,note,snapshot) select id,'filmes','123',10,repeat('x',201),'{"titulo":"Fixture"}' from list_test_state where name='public';raise exception 'Long note accepted';exception when check_violation then null;end;
 begin insert into public.list_items(list_id,media_type,external_id,position,snapshot) select id,'filmes','123',201,'{"titulo":"Fixture"}' from list_test_state where name='public';raise exception 'Bad position accepted';exception when check_violation then null;end;
 begin insert into public.list_saves(list_id,user_id) select id,auth.uid() from list_test_state where name='public';raise exception 'Saved own list';exception when insufficient_privilege then null;end;
end$$;
update public.void_community_profiles set visibility='private' where user_id=auth.uid();
select set_config('request.jwt.claim.sub',(select b::text from list_test_ids),true);
do $$begin
 if public.void_list_detail((select id from list_test_state where name='public')) is not null then raise exception 'Private owner profile exposed';end if;
 if jsonb_array_length(public.void_lists_page('saved')->'rows')<>0 then raise exception 'Hidden saved list leaked';end if;
end$$;
select set_config('request.jwt.claim.sub',(select a::text from list_test_ids),true);
update public.void_community_profiles set visibility='public' where user_id=auth.uid();
do $$declare limited boolean:=false;begin
 for n in 1..11 loop
  begin perform public.void_list_write(null,jsonb_build_object('title','Extra '||n,'visibility','public','ranked',false),'[]');exception when sqlstate 'P0001' then if sqlerrm<>'RATE_LIMIT' then raise;end if;limited:=true;exit;end;
 end loop;
 if not limited or (select count(*) from public.lists where owner_id=auth.uid())<>10 then raise exception 'Hourly creation limit failed';end if;
end$$;
set local timezone='Asia/Kolkata';
do $$begin
 begin perform public.void_list_write(null,'{"title":"Timezone bypass","visibility":"public","ranked":false}','[]');raise exception 'Client timezone reset the quota';exception when sqlstate 'P0001' then if sqlerrm<>'RATE_LIMIT' then raise;end if;end;
end$$;
set local timezone='UTC';
delete from public.lists where id=(select id from list_test_state where name='public');
do $$begin if exists(select 1 from public.list_items where list_id=(select id from list_test_state where name='public')) then raise exception 'Delete did not cascade';end if;end$$;
select set_config('request.jwt.claim.sub',(select b::text from list_test_ids),true);
do $$begin
 for n in 1..8 loop perform public.void_list_write(null,jsonb_build_object('title','Página '||n,'visibility','public','ranked',false),'[]');end loop;
end$$;
reset role;
set local role anon;
do $$declare first_page jsonb;next_page jsonb;begin
 first_page:=public.void_lists_page('discover','popular');next_page:=public.void_lists_page('discover','popular',null,1);
 if jsonb_array_length(first_page->'rows')<>12 or not(first_page->>'has_more')::boolean or jsonb_array_length(next_page->'rows')<>2 or (next_page->>'has_more')::boolean then raise exception 'List pagination failed';end if;
 if exists(select 1 from jsonb_array_elements(first_page->'rows') a cross join jsonb_array_elements(next_page->'rows') b where a->>'id'=b->>'id') then raise exception 'Repeated list across pages';end if;
 if has_function_privilege('anon','public.void_list_write(uuid,jsonb,jsonb,timestamptz)','execute') then raise exception 'Anon write RPC granted';end if;
 if exists(select 1 from public.list_saves) then raise exception 'Anon saved collection leak';end if;
end$$;
reset role;
rollback;
