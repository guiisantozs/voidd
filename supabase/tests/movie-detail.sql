-- Integration fixtures are rolled back; never persist test accounts or reviews.
begin;
create temp table detail_test_ids as select gen_random_uuid() a,gen_random_uuid() b,gen_random_uuid() c;
grant select on detail_test_ids to anon,authenticated;
insert into auth.users(id) select a from detail_test_ids union all select b from detail_test_ids union all select c from detail_test_ids;
insert into public.void_community_profiles(user_id,display_name) select a,'Teste A' from detail_test_ids union all select b,'Teste B' from detail_test_ids union all select c,'Teste C' from detail_test_ids on conflict(user_id) do update set display_name=excluded.display_name,visibility=excluded.visibility;
update public.void_community_profiles set username='test_'||substr(md5(user_id::text),1,12) where user_id in(select a from detail_test_ids union all select b from detail_test_ids union all select c from detail_test_ids);
insert into public.void_records(user_id,kind,item_key,payload)
select a,'review','filmes:9999999999',jsonb_build_object('item',jsonb_build_object('id',9999999999,'categoria','filmes','titulo','Teste RLS'),'nota',4.5,'texto','Review pública A','public',true) from detail_test_ids
union all select b,'review','filmes:9999999999',jsonb_build_object('item',jsonb_build_object('id',9999999999,'categoria','filmes','titulo','Teste RLS'),'nota',1,'texto','Review privada B','public',false) from detail_test_ids
union all select c,'review','filmes:9999999999',jsonb_build_object('item',jsonb_build_object('id',9999999999,'categoria','filmes','titulo','Teste RLS'),'nota',2,'texto','Review pública C','public',true) from detail_test_ids;
insert into public.void_friendships(sender,recipient,status) select a,b,'accepted' from detail_test_ids;

set local role anon;
do $$declare s jsonb;begin
 s:=public.void_movie_review_summary('filmes:9999999999');
 if (s->>'total')::int<>2 or (s->>'average')::numeric<>6.5 then raise exception 'Anonymous summary leaked a private rating: %',s;end if;
 if jsonb_array_length(s->'histogram')<>11 then raise exception 'Histogram is incomplete';end if;
 if (public.void_movie_review_page('filmes:9999999999')->>'total')::int<>2 then raise exception 'Public page leaked private review';end if;
end$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select b::text from detail_test_ids),true);
do $$begin
 if (public.void_movie_review_summary('filmes:9999999999')->>'total')::int<>2 then raise exception 'Own private review contaminated public summary';end if;
end$$;
insert into public.void_review_likes(user_id,review_user,item_key) select b,a,'filmes:9999999999' from detail_test_ids;
do $$begin
 begin
  insert into public.void_review_likes(user_id,review_user,item_key) select b,a,'filmes:9999999999' from detail_test_ids;
  raise exception 'Duplicate like accepted';
 exception when unique_violation then null;end;
 begin
  insert into public.void_review_likes(user_id,review_user,item_key) select a,c,'filmes:9999999999' from detail_test_ids;
  raise exception 'Forged owner accepted';
 exception when insufficient_privilege then null;end;
 begin
  insert into public.void_review_comments(user_id,review_user,item_key,body) select b,b,'filmes:9999999999','Private target' from detail_test_ids;
  raise exception 'Comment on private review accepted';
 exception when insufficient_privilege then null;end;
end$$;
insert into public.void_review_comments(user_id,review_user,item_key,body) select b,a,'filmes:9999999999','Comentário de teste' from detail_test_ids;
do $$begin
 begin
  insert into public.void_review_comments(user_id,review_user,item_key,body) select b,a,'filmes:9999999999',repeat(' ',1100)||'x' from detail_test_ids;
  raise exception 'Padded comment bypassed size limit';
 exception when check_violation then null;end;
end$$;
insert into public.void_review_reports(user_id,review_user,item_key,reason) select b,a,'filmes:9999999999','Denúncia de teste' from detail_test_ids;
do $$declare p jsonb;begin
 p:=public.void_movie_review_page('filmes:9999999999','likes');
 if (p->'reviews'->0->>'likes')::int<>1 or not (p->'reviews'->0->>'liked')::boolean then raise exception 'Like aggregation failed: %',p;end if;
 if (public.void_movie_review_comments('filmes:9999999999',(select a from detail_test_ids))->>'total')::int<>1 then raise exception 'Comment retrieval failed';end if;
end$$;
select set_config('request.jwt.claim.sub',(select a::text from detail_test_ids),true);
do $$begin
 if (public.void_movie_review_summary('filmes:9999999999')->>'friendCount')::int<>0 then raise exception 'Private friend rating leaked';end if;
 if (select count(*) from public.void_review_reports)<>0 then raise exception 'Report disclosed to target';end if;
 delete from public.void_review_comments where item_key='filmes:9999999999';
 if (select count(*) from public.void_review_comments where item_key='filmes:9999999999')<>1 then raise exception 'Deleted another user comment';end if;
 update public.void_records set payload=jsonb_set(payload,'{public}','false') where user_id=auth.uid() and kind='review' and item_key='filmes:9999999999';
end$$;
reset role;
set local role anon;
do $$begin
 if exists(select 1 from public.void_review_comments where item_key='filmes:9999999999') or exists(select 1 from public.void_review_likes where item_key='filmes:9999999999') then raise exception 'Interactions exposed after review became private';end if;
end$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select b::text from detail_test_ids),true);
update public.void_records set payload=jsonb_set(payload,'{public}','true') where user_id=auth.uid() and kind='review' and item_key='filmes:9999999999';
select set_config('request.jwt.claim.sub',(select a::text from detail_test_ids),true);
do $$begin
 if (public.void_movie_review_summary('filmes:9999999999')->>'friendCount')::int<>1 then raise exception 'Published friend missing';end if;
 if (public.void_movie_review_page('filmes:9999999999','recent',0,10,0,true)->>'total')::int<>1 then raise exception 'Friends filter failed';end if;
end$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select c::text from detail_test_ids),true);
do $$declare i int;blocked boolean:=false;begin
 for i in 1..11 loop
  begin
   update public.void_records set payload=jsonb_set(payload,'{texto}',to_jsonb(i::text)) where user_id=auth.uid() and kind='review' and item_key='filmes:9999999999';
  exception when sqlstate 'P0001' then blocked:=true;end;
 end loop;
 if not blocked then raise exception 'Write rate limit was not enforced';end if;
end$$;
reset role;
rollback;
