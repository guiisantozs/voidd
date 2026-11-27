begin;
create temporary table feed_ids(n integer,id uuid);
insert into feed_ids select n,('90000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,8)n;
insert into auth.users(id) select id from feed_ids;
insert into public.void_community_profiles(user_id,display_name,username,visibility) select id,'Pessoa '||n,'feed_'||n,case n when 4 then 'private' when 5 then 'followers' else 'public' end from feed_ids;
insert into public.void_friendships(sender,recipient,status) select a.id,b.id,case b.n when 3 then 'pending' else 'accepted' end from feed_ids a cross join feed_ids b where a.n=1 and b.n in(2,3,4);
insert into public.follows select a.id,b.id,now() from feed_ids a cross join feed_ids b where (a.n=1 and b.n in(5,6)) or (a.n=6 and b.n=1);
-- 26 public games by the accepted friend; one private review, one old review,
-- and explicit opt-in contexts. Private library status must never leak.
insert into public.void_records(user_id,kind,item_key,payload,created_at,updated_at)
select id,'review','jogos:'||(8000+i),jsonb_build_object('item',jsonb_build_object('id',8000+i,'categoria','jogos','titulo','Jogo '||i,'plataformas',jsonb_build_array(case when i%2=0 then 'PlayStation 5' else 'PC' end),'generos',jsonb_build_array(case when i%2=0 then 'Action' else 'Indie' end)),'nota',case when i=1 then 0 else (i%5)+0.1 end,'public',i<>26,'texto',case when i%2=0 then 'Texto da avaliação' else '' end,'spoiler',i=2,'feed_context',case when i=2 then jsonb_build_object('share_status',true,'status','finished','platform','PlayStation 5','marked_at',now()) when i=3 then jsonb_build_object('share_status',true,'status','playing_now','marked_at',now()) when i=4 then jsonb_build_object('share_status',false,'status','platinum') else '{}'::jsonb end),now()-i*interval '1 minute',now()-i*interval '1 minute'
from feed_ids cross join generate_series(1,26)i where n=2;
insert into public.void_records(user_id,kind,item_key,payload,created_at,updated_at)
select id,'review','jogos:'||(9000+n),jsonb_build_object('item',jsonb_build_object('id',9000+n,'categoria','jogos','titulo','Outro '||n),'nota',4,'public',true,'texto','Review'),now(),now() from feed_ids where n<>2;
insert into public.void_records(user_id,kind,item_key,payload,created_at,updated_at)
select id,'review','jogos:7000',jsonb_build_object('item',jsonb_build_object('id',7000,'categoria','jogos','titulo','Antigo'),'nota',3,'public',true),now()-interval '40 days',now() from feed_ids where n=2;
insert into public.void_records(user_id,kind,item_key,payload) select id,'library','8001',jsonb_build_object('item',jsonb_build_object('id',8001,'categoria','jogos','titulo','Jogo 1'),'status','finished') from feed_ids where n=2;
insert into public.void_records(user_id,kind,item_key,payload) select id,'review','filmes:550',jsonb_build_object('item',jsonb_build_object('id',550,'categoria','filmes','titulo','Filme preservado'),'nota',4.7,'public',true) from feed_ids where n=2;
insert into public.void_review_likes(user_id,review_user,item_key)select a.id,b.id,'jogos:8002' from feed_ids a cross join feed_ids b where a.n in(1,3) and b.n=2;
insert into public.void_review_comments(user_id,review_user,item_key,body)select a.id,b.id,'jogos:8002','Comentário' from feed_ids a cross join feed_ids b where a.n=1 and b.n=2;
set local role anon;
do $$declare data jsonb;begin
 data:=public.void_reviews_feed('jogos','{"period":"all"}');
 if (data->>'total')::int<>31 then raise exception 'Anonymous privacy/count: %',data->>'total';end if;
 if (public.void_reviews_feed('jogos','{"tab":"amigos"}')->>'total')::int<>0 then raise exception 'Guest friends leaked';end if;
 if (public.void_reviews_feed('jogos','{"status":"platinum"}')->>'total')::int<>0 then raise exception 'Unshared status leaked';end if;
 if (public.void_reviews_feed('jogos','{"status":"finished"}')->>'total')::int<>1 then raise exception 'Library status leaked or explicit status missing';end if;
 if (public.void_reviews_feed('jogos','{"minRating":"0","maxRating":"0"}')->>'total')::int<>1 then raise exception 'Zero rating lost';end if;
 if (public.void_reviews_feed('jogos','{"q":"Antigo","period":"month"}')->>'total')::int<>0 or (public.void_reviews_feed('jogos','{"q":"Antigo","period":"all"}')->>'total')::int<>1 then raise exception 'Creation window mismatch';end if;
 if (public.void_reviews_feed('filmes','{}')->>'total')::int<>1 then raise exception 'Movie compatibility';end if;
end$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
do $$declare data jsonb;next_page jsonb;visited text[];sort text;row jsonb;begin
 if (public.void_reviews_feed('jogos','{"tab":"amigos","period":"all"}')->>'total')::int<>26 then raise exception 'Accepted friend count; pending/follows/private leakage';end if;
 if (public.void_reviews_feed('jogos','{"platform":"playstation","genre":"action","text":"with"}')->>'total')::int<>12 then raise exception 'Combined filters';end if;
 if (public.void_reviews_feed('jogos','{"status":"playing"}')->>'total')::int<>1 then raise exception 'Playing snapshot';end if;
 data:=public.void_reviews_feed('jogos','{"sort":"likes"}');
 if data->'rows'->0->>'item_key'<>'jogos:8002' or (data->'rows'->0->>'likes')::int<>2 or (data->'rows'->0->>'comments')::int<>1 then raise exception 'Social aggregates';end if;
 if jsonb_array_length(data->'friends_playing')<>1 then raise exception 'Opt-in manual presence';end if;
 if (public.void_movie_review_comments('jogos:8002','90000000-0000-4000-8000-000000000002',0)->>'total')::int<>1 then raise exception 'Existing comments RPC does not support games';end if;
 data:=public.void_reviews_feed('jogos','{"tab":"amigos","period":"all"}');
 begin
  perform public.void_reviews_feed('jogos','{"tab":"amigos","period":"week"}',data->'cursor');
  raise exception 'Cursor accepted after changing filters';
 exception when others then if sqlerrm<>'INVALID_CURSOR' then raise;end if;end;
 foreach sort in array array['recent','likes','highest','lowest','comments'] loop
  visited:=array[]::text[];next_page:=null;
  loop
   data:=public.void_reviews_feed('jogos',jsonb_build_object('tab','amigos','period','all','sort',sort),next_page);
   for row in select * from jsonb_array_elements(data->'rows') loop if row->>'item_key'=any(visited) then raise exception 'Duplicate cursor row';end if;visited:=array_append(visited,row->>'item_key');end loop;
   exit when not (data->>'has_more')::boolean;next_page:=data->'cursor';
  end loop;
  if cardinality(visited)<>26 then raise exception 'Cursor lost rows for %: %',sort,cardinality(visited);end if;
 end loop;
end$$;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000004',true);
do $$begin
 if exists(select 1 from jsonb_array_elements(public.void_reviews_feed('jogos','{"period":"all"}')->'rows') row where row->>'user_id'=auth.uid()::text) then raise exception 'Private profile leaked its own review into the public feed';end if;
end$$;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
-- Existing movie and game interactions both preserve the owner's RLS.
insert into public.void_review_comments(user_id,review_user,item_key,body)values(auth.uid(),'90000000-0000-4000-8000-000000000002','jogos:8002','Resposta de jogo'),(auth.uid(),'90000000-0000-4000-8000-000000000002','filmes:550','Resposta de filme');
do $$begin
 begin insert into public.void_review_likes(user_id,review_user,item_key) values(auth.uid(),'90000000-0000-4000-8000-000000000004','jogos:9004');raise exception 'Private interaction accepted';exception when insufficient_privilege then null;end;
end$$;
reset role;
rollback;
