-- DEVELOPMENT ONLY. All synthetic data is rolled back.
begin;
create temp table media_ids as select gen_random_uuid() a,gen_random_uuid() b,gen_random_uuid() c;
grant select on media_ids to authenticated;
insert into auth.users(id) select a from media_ids union all select b from media_ids union all select c from media_ids;
insert into public.void_community_profiles(user_id,username,display_name,visibility)
select id,'media_'||substr(md5(id::text),1,12),'Fixture','public' from media_ids cross join lateral(values(a),(b),(c)) t(id)
on conflict(user_id) do update set username=excluded.username,visibility='public';
create temp table media_lists(name text,id uuid);grant select,insert on media_lists to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select a::text from media_ids),true);
insert into media_lists values
 ('film',public.void_list_write(null,'{"title":"Filmes","visibility":"public","ranked":false,"media_types":["filmes"]}','[]')),
 ('game',public.void_list_write(null,'{"title":"Jogos privados","visibility":"private","ranked":false,"media_types":["jogos"]}','[]')),
 ('mixed',public.void_list_write(null,'{"title":"Mista","visibility":"public","ranked":false,"media_types":["jogos","animes"]}','[]'));
do $$declare lid uuid:=(select id from media_lists where name='film');begin
 if jsonb_array_length(public.void_lists_page_v2('mine','recent',null,0,'jogos')->'rows')<>2 then raise exception 'Owner filter failed';end if;
 perform public.void_list_write(lid,'{"title":"Novo nome","description":"Nova bio","visibility":"private","ranked":true,"media_types":["series"]}',null,(select updated_at from public.lists where lists.id=lid));
 if (public.void_list_detail(lid)->>'title')<>'Novo nome' or public.void_list_detail(lid)->'media_types'<>'["series"]'::jsonb then raise exception 'Category edit failed';end if;
 -- Older clients omit categories: preserve the edited category, not the default.
 perform public.void_list_write(lid,'{"title":"Cliente anterior","visibility":"private","ranked":false}',null,(select updated_at from public.lists where lists.id=lid));
 if public.void_list_detail(lid)->'media_types'<>'["series"]'::jsonb then raise exception 'Legacy edit reset categories';end if;
 begin update public.lists set media_types=array['filmes','filmes'] where lists.id=lid;raise exception 'Duplicate category allowed';exception when check_violation then null;end;
 begin update public.lists set media_types=array[]::text[] where lists.id=lid;raise exception 'Empty category allowed';exception when check_violation then null;end;
 begin perform public.void_list_write(null,'{"title":"Invalid","visibility":"public","ranked":false,"media_types":["livros"]}','[]');raise exception 'Unknown media allowed';exception when check_violation then null;end;
end$$;
select set_config('request.jwt.claim.sub',(select b::text from media_ids),true);
do $$begin
 if jsonb_array_length(public.void_lists_page_v2('profile','recent',(select a from media_ids),0,'jogos')->'rows')<>1 then raise exception 'Filter exposed private list';end if;
end$$;
select set_config('request.jwt.claim.sub',(select a::text from media_ids),true);
update public.void_community_profiles set visibility='private' where user_id=auth.uid();
select set_config('request.jwt.claim.sub',(select b::text from media_ids),true);
do $$begin
 if jsonb_array_length(public.void_lists_page_v2('profile','recent',(select a from media_ids),0,'jogos')->'rows')<>0 then raise exception 'Filter exposed private profile';end if;
end$$;
reset role;
select set_config('request.jwt.claim.sub','',true);
insert into public.lists(owner_id,title,media_types) select c,'Filme '||n,array['filmes'] from media_ids cross join generate_series(1,13) n;
insert into public.lists(owner_id,title,media_types) select c,'Jogo '||n,array['jogos'] from media_ids cross join generate_series(1,2) n;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select b::text from media_ids),true);
do $$declare result jsonb;begin
 result:=public.void_lists_page_v2('profile','recent',(select c from media_ids),0,'jogos');
 if jsonb_array_length(result->'rows')<>2 or (result->>'has_more')::boolean then raise exception 'Filter must run before pagination';end if;
 begin perform public.void_lists_page_v2('discover','recent',null,0,'livros');raise exception 'Invalid filter accepted';exception when sqlstate 'P0001' then if sqlerrm<>'INVALID_QUERY' then raise;end if;end;
end$$;
reset role;
rollback;
