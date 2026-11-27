begin;
insert into auth.users(id) values('90000000-0000-4000-8000-000000000001'),('90000000-0000-4000-8000-000000000002');
insert into public.void_community_profiles(user_id,display_name,username,visibility) values
 ('90000000-0000-4000-8000-000000000001','Ana','save_ana','public'),('90000000-0000-4000-8000-000000000002','Bia','save_bia','public');
-- Seed historical pagination fixtures as administrator, without consuming user quotas.
select set_config('request.jwt.claim.sub','',true);
insert into public.lists(owner_id,title,visibility,source_key,media_types) values
 ('90000000-0000-4000-8000-000000000001','Nome personalizado','public','watchlist',array['filmes']);
insert into public.lists(owner_id,title,visibility) select '90000000-0000-4000-8000-000000000001','Criada '||n,'public' from generate_series(1,13)n;
insert into public.follows(follower_id,followed_id) values('90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
do $$declare page jsonb;begin
 page:=public.void_lists_page_v2('mine');
 if jsonb_array_length(page->'rows')<>12 or not (page->>'has_more')::boolean then raise exception 'Owner paging failed';end if;
 if jsonb_array_length(public.void_lists_page_v2('profile','recent',auth.uid())->'rows')<>12 then raise exception 'Profile changed';end if;
end$$;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
do $$declare page jsonb;begin
 for ordering in 1..2 loop
  page:=public.void_lists_page_v2('discover',case ordering when 1 then 'recent' else 'popular' end);
  if jsonb_array_length(page->'rows')<>12 or not (page->>'has_more')::boolean then raise exception 'Discovery page not full';end if;
  if exists(select 1 from jsonb_array_elements(page->'rows')r where r->>'source_key' is not null) then raise exception 'Default in discovery';end if;
 end loop;
 page:=public.void_lists_page_v2('discover','recent',null,1);
 if jsonb_array_length(page->'rows')<>1 or (page->>'has_more')::boolean then raise exception 'Discovery filter applied after paging';end if;
 page:=public.void_lists_page_v2('following');
 if exists(select 1 from jsonb_array_elements(page->'rows')r where r->>'source_key' is not null) then raise exception 'Default in followed discovery';end if;
 if not exists(select 1 from public.lists where source_key='watchlist' and title='Nome personalizado') then raise exception 'Default record removed';end if;
end$$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$begin
 if exists(select 1 from jsonb_array_elements(public.void_lists_page_v2('discover')->'rows')r where r->>'source_key' is not null) then raise exception 'Default visible to anon discovery';end if;
end$$;
rollback;
