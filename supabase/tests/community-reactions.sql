-- DEVELOPMENT ONLY: synthetic identities, no hosted production fixture writes.
begin;
create temp table reaction_ids as select gen_random_uuid() a,gen_random_uuid() b,gen_random_uuid() c;
grant select on reaction_ids to anon,authenticated;
insert into auth.users(id) select a from reaction_ids union all select b from reaction_ids union all select c from reaction_ids;
insert into public.void_community_profiles(user_id,username,display_name,visibility)
select id,'like_'||substr(md5(id::text),1,12),'Fixture','public' from reaction_ids cross join lateral(values(a),(b),(c)) t(id)
on conflict(user_id) do update set username=excluded.username,visibility='public';
create temp table reaction_list(id uuid);grant select,insert on reaction_list to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select a::text from reaction_ids),true);
with created as(insert into public.lists(owner_id,title) values(auth.uid(),'Pública por padrão') returning id)
insert into reaction_list select id from created;
do $$begin
 if (select visibility from public.lists where id=(select id from reaction_list))<>'public' then raise exception 'New list not public';end if;
end$$;
insert into public.void_records(user_id,kind,item_key,payload) values
 (auth.uid(),'review','filmes:99000001','{"item":{"id":99000001,"categoria":"filmes","titulo":"Fixture"},"nota":4.2,"public":true}'),
 (auth.uid(),'review','filmes:99000002','{"item":{"id":99000002,"categoria":"filmes","titulo":"Privada"},"nota":0,"public":false}');
select set_config('request.jwt.claim.sub',(select b::text from reaction_ids),true);
insert into public.list_likes(list_id,user_id) select id,auth.uid() from reaction_list;
insert into public.void_review_likes(user_id,review_user,item_key) select auth.uid(),a,'filmes:99000001' from reaction_ids;
do $$declare result jsonb;begin
 if not(public.void_lists_page('discover')->'rows'->0->>'liked')::boolean then raise exception 'Missing own list reaction';end if;
 result:=public.void_review_reactions(jsonb_build_array(jsonb_build_object('review_user',(select a from reaction_ids),'item_key','filmes:99000001'),jsonb_build_object('review_user',(select a from reaction_ids),'item_key','filmes:99000002')));
 if jsonb_array_length(result)<>1 or (result->0->>'likes')::int<>1 or not(result->0->>'liked')::boolean then raise exception 'Public/own reaction aggregate failed';end if;
 begin insert into public.void_review_likes(user_id,review_user,item_key) select auth.uid(),a,'filmes:99000001' from reaction_ids;raise exception 'Duplicate like allowed';exception when unique_violation then null;end;
 begin insert into public.void_review_likes(user_id,review_user,item_key) select auth.uid(),a,'filmes:99000002' from reaction_ids;raise exception 'Private review like allowed';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub',(select c::text from reaction_ids),true);
do $$declare result jsonb;begin
 result:=public.void_review_reactions(jsonb_build_array(jsonb_build_object('review_user',(select a from reaction_ids),'item_key','filmes:99000001')));
 if (result->0->>'likes')::int<>1 or (result->0->>'liked')::boolean then raise exception 'Viewer reaction isolation failed';end if;
 begin perform public.void_review_reactions((select jsonb_agg(jsonb_build_object('review_user',a,'item_key','filmes:99000001')) from reaction_ids cross join generate_series(1,51)));raise exception 'Unbounded aggregate allowed';exception when sqlstate 'P0001' then if sqlerrm<>'INVALID_QUERY' then raise;end if;end;
end$$;
-- A private profile protects even a review marked public.
select set_config('request.jwt.claim.sub',(select a::text from reaction_ids),true);
update public.void_community_profiles set visibility='private' where user_id=auth.uid();
select set_config('request.jwt.claim.sub',(select c::text from reaction_ids),true);
do $$begin
 if public.void_review_reactions(jsonb_build_array(jsonb_build_object('review_user',(select a from reaction_ids),'item_key','filmes:99000001')))<>'[]'::jsonb then raise exception 'Private profile leaked reactions';end if;
end$$;
reset role;
rollback;
