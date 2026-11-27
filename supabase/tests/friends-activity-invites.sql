-- DEVELOPMENT DATABASE ONLY. Synthetic catalog IDs below are fixtures, not API data.
begin;
create temp table circle_ids as select gen_random_uuid() a,gen_random_uuid() b,gen_random_uuid() c;
grant select on circle_ids to authenticated;
insert into auth.users(id) select a from circle_ids union all select b from circle_ids union all select c from circle_ids;
update public.void_community_profiles set username='circle_'||substr(md5(user_id::text),1,12),visibility='public'
where user_id in(select a from circle_ids union all select b from circle_ids union all select c from circle_ids);
create temp table circle_handles as select i.*,p.username b_handle,q.username c_handle from circle_ids i join public.void_community_profiles p on p.user_id=i.b join public.void_community_profiles q on q.user_id=i.c;
grant select on circle_handles to authenticated;
insert into public.void_records(user_id,kind,item_key,payload,updated_at)
select b,'review',(case when n=10 then 'jogos:' else 'filmes:' end)||(99000000+n),jsonb_build_object('item',jsonb_build_object('id',99000000+n,'categoria',case when n=10 then 'jogos' else 'filmes' end,'titulo','Fixture '||n),'nota',case when n=1 then 0 else 4.2 end,'ratingScale',5,'public',true,'texto',case when n=1 then 'SECRET_SPOILER' else 'Public excerpt' end,'spoiler',n=1),now()-make_interval(secs=>case when n=1 then 1 else 2 end)
from circle_ids cross join generate_series(1,10) n;
insert into public.void_records(user_id,kind,item_key,payload)
select b,'review','jogos:99000100',jsonb_build_object('item',jsonb_build_object('id',99000100,'categoria','jogos','titulo','Private fixture'),'nota',5,'public',false) from circle_ids
union all select c,'review','filmes:99000200',jsonb_build_object('item',jsonb_build_object('id',99000200,'categoria','filmes','titulo','Hidden profile fixture'),'nota',5,'public',true) from circle_ids;
update public.void_community_profiles set visibility='private' where user_id=(select c from circle_ids);
set local role authenticated;
select set_config('request.jwt.claim.sub',(select a::text from circle_ids),true);
do $$declare result text;begin
 if public.void_request_friend((select username from public.void_community_profiles where user_id=auth.uid()))<>'self' then raise exception 'Self invite allowed';end if;
 if public.void_request_friend('missing_circle_user')<>'missing' then raise exception 'Unknown handle accepted';end if;
 result:=public.void_request_friend((select b_handle from circle_handles));
 if result<>'sent' or public.void_request_friend((select b_handle from circle_handles))<>'sent' then raise exception 'Duplicate referral failed';end if;
 if (select count(*) from public.void_friendships where sender=auth.uid() and recipient=(select b from circle_ids))<>1 then raise exception 'Duplicate invitation';end if;
 if jsonb_array_length(public.void_friend_activity()->'rows')<>0 then raise exception 'Pending invite exposed activity';end if;
end$$;
select set_config('request.jwt.claim.sub',(select b::text from circle_ids),true);
do $$begin
 if public.void_request_friend((select username from public.void_community_profiles where user_id=(select a from circle_ids)))<>'received' then raise exception 'Reverse invitation autoaccepted';end if;
 if (select status from public.void_friendships where recipient=auth.uid())<>'pending' then raise exception 'Autoaccepted in inviter name';end if;
end$$;
update public.void_friendships set status='accepted' where recipient=auth.uid();
reset role;
insert into public.void_friendships(sender,recipient,status) select a,c,'accepted' from circle_ids;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select a::text from circle_ids),true);
do $$declare page jsonb;next_page jsonb;last jsonb;begin
 page:=public.void_friend_activity();
 if jsonb_array_length(page->'rows')<>8 or not(page->>'has_more')::boolean then raise exception 'First page wrong: %',page;end if;
 if page::text like '%SECRET_SPOILER%' or page::text like '%Private fixture%' or page::text like '%Hidden profile fixture%' then raise exception 'Privacy or spoiler leak';end if;
 if (page->'rows'->0->>'rating')::numeric<>0 then raise exception 'Zero rating lost';end if;
 last:=page->'cursor';next_page:=public.void_friend_activity(false,(last->>'time')::timestamptz,(last->>'user')::uuid,last->>'item');
 if jsonb_array_length(next_page->'rows')<>2 or (next_page->>'has_more')::boolean then raise exception 'Cursor pagination wrong';end if;
 if exists(select 1 from jsonb_array_elements(page->'rows') p cross join jsonb_array_elements(next_page->'rows') n where p->>'item_key'=n->>'item_key') then raise exception 'Repeated item';end if;
 if not exists(select 1 from jsonb_array_elements(page->'rows') v where v->>'item_key' like 'jogos:%') then raise exception 'Non-movie media missing';end if;
 if jsonb_array_length(public.void_friend_activity(true)->'rows')<>1 then raise exception 'Latest must return one per visible friend';end if;
end$$;
-- Profile privacy applies even after friendship; no private-library presence leak.
select set_config('request.jwt.claim.sub',(select b::text from circle_ids),true);
update public.void_community_profiles set visibility='private' where user_id=auth.uid();
select set_config('request.jwt.claim.sub',(select a::text from circle_ids),true);
do $$begin if jsonb_array_length(public.void_friend_activity()->'rows')<>0 then raise exception 'Private profile leaked';end if;end$$;
select set_config('request.jwt.claim.sub',(select b::text from circle_ids),true);
update public.void_community_profiles set visibility='public' where user_id=auth.uid();
select set_config('request.jwt.claim.sub',(select a::text from circle_ids),true);
do $$begin if jsonb_array_length(public.void_friend_activity()->'rows')<>8 then raise exception 'Public friend activity missing';end if;end$$;
delete from public.void_friendships where sender=auth.uid();
do $$begin if jsonb_array_length(public.void_friend_activity(true)->'rows')<>0 then raise exception 'Removed friend exposed';end if;end$$;
-- Fixed RPC budget also applies to idempotent / missing-handle requests.
do $$declare limited boolean:=false;begin
 for n in 1..15 loop
  begin perform public.void_request_friend('missing_circle_user');exception when sqlstate 'P0001' then limited:=true;exit;end;
 end loop;
 if not limited then raise exception 'Referral rate limit missing';end if;
end$$;
reset role;
do $$begin
 if has_function_privilege('anon','public.void_friend_activity(boolean,timestamptz,uuid,text)','execute') or has_function_privilege('anon','public.void_request_friend(text)','execute') then raise exception 'Anonymous social RPC grant';end if;
end$$;
rollback;
