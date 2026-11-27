-- Run only in a development database. All fixture writes are rolled back.
begin;
create temp table rating_test_ids as select gen_random_uuid() a,gen_random_uuid() b,gen_random_uuid() c,gen_random_uuid() d;
grant select on rating_test_ids to anon,authenticated;
insert into auth.users(id) select a from rating_test_ids union all select b from rating_test_ids union all select c from rating_test_ids union all select d from rating_test_ids;
update public.void_community_profiles set username='rating_'||substr(md5(user_id::text),1,12),visibility='public'
where user_id in(select a from rating_test_ids union all select b from rating_test_ids union all select c from rating_test_ids union all select d from rating_test_ids);
insert into public.void_records(user_id,kind,item_key,payload)
select person,'review','filmes:9999999998',jsonb_build_object('item',jsonb_build_object('id',9999999998,'categoria','filmes','titulo','Teste notas'),'nota',note,'ratingScale',5,'public',published)
from rating_test_ids cross join lateral(values(a,4.2,true),(b,4.4,true),(c,4.7,true),(d,0,false)) t(person,note,published);

set local role anon;
do $$declare s jsonb;p jsonb;begin
 s:=public.void_movie_review_summary_v2('filmes:9999999998');
 if (s->>'total')::int<>3 or abs((s->>'average')::numeric-13.3/3)>0.000001 then raise exception 'Wrong decimal average or private rating leak: %',s;end if;
 if jsonb_array_length(s->'histogram')<>11 or (select max((v->>'rating')::numeric) from jsonb_array_elements(s->'histogram') v)<>5
 or (select sum((v->>'total')::int) from jsonb_array_elements(s->'histogram') v)<>3 then raise exception 'Wrong /5 histogram: %',s;end if;
 p:=public.void_movie_review_page_v2('filmes:9999999998','recent',4.3,4.5);
 if (p->>'total')::int<>1 or (p->'reviews'->0->>'rating')::numeric<>4.4 then raise exception 'Wrong decimal filter: %',p;end if;
 if abs((public.void_movie_review_summary('filmes:9999999998')->>'average')::numeric-26.6/3)>0.000001 then raise exception 'Legacy /10 client compatibility lost';end if;
 if (public.void_profile_reviews_v2((select b from rating_test_ids),'all',4.3,4.5)->>'total')::int<>1 then raise exception 'Profile rating filter failed';end if;
end$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select d::text from rating_test_ids),true);
do $$declare s jsonb;begin
 s:=public.void_profile_overview_v2(auth.uid());
 if (s->'counts'->>'reviews')::int<>1 or (s->'histogram'->0->>'total')::int<>1 then raise exception 'Zero rating missing from own profile';end if;
 if (public.void_movie_review_summary_v2('filmes:9999999998')->>'total')::int<>3 then raise exception 'Own private zero leaked to community';end if;
end$$;
update public.void_records set payload=jsonb_set(payload,'{public}','true') where user_id=auth.uid() and item_key='filmes:9999999998' and kind='review';
do $$begin
 if abs((public.void_movie_review_summary_v2('filmes:9999999998')->>'average')::numeric-3.325)>0.000001 then raise exception 'Zero excluded from average';end if;
 begin
  update public.void_records set payload=jsonb_set(payload,'{nota}','4.25') where user_id=auth.uid() and item_key='filmes:9999999998';
  raise exception 'Two decimal places accepted';
 exception when check_violation then null;end;
 begin
  update public.void_records set payload=jsonb_set(payload,'{nota}','6') where user_id=auth.uid() and item_key='filmes:9999999998';
  raise exception 'Out of range score accepted';
 exception when check_violation then null;end;
 begin
  update public.void_records set payload=jsonb_set(payload,'{nota}','"4.2"') where user_id=auth.uid() and item_key='filmes:9999999998';
  raise exception 'String score accepted';
 exception when check_violation then null;end;
end$$;
update public.void_community_profiles set visibility='private' where user_id=auth.uid();
reset role;
set local role anon;
do $$begin
 if (public.void_movie_review_summary_v2('filmes:9999999998')->>'total')::int<>3 then raise exception 'Private profile leaked';end if;
 if not (public.void_profile_overview_v2((select d from rating_test_ids))->>'locked')::boolean then raise exception 'Profile privacy bypassed';end if;
end$$;
reset role;
rollback;
