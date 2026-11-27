-- DEVELOPMENT ONLY. Synthetic fixtures, always rolled back.
begin;
create temp table friend_review_ids as
select n, ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid id from generate_series(1,11) n;
grant select on friend_review_ids to anon,authenticated;
insert into auth.users(id) select id from friend_review_ids;
insert into public.void_community_profiles(user_id,display_name,username,visibility)
select id,'Fixture '||n,'friend_review_'||n,
  case when n=8 then 'private' when n in(9,11) then 'followers' else 'public' end
from friend_review_ids;
insert into public.void_friendships(sender,recipient,status)
select a.id,b.id,case when b.n in(4,5) then 'pending' else 'accepted' end
from friend_review_ids a cross join friend_review_ids b
where a.n=1 and b.n in(2,4,8,9,11);
insert into public.void_friendships(sender,recipient,status)
select a.id,b.id,case when a.n=5 then 'pending' else 'accepted' end
from friend_review_ids a cross join friend_review_ids b
where (a.n in(3,5) and b.n=1) or (a.n=10 and b.n=2);
-- Mutual following (6), follower only (7), and an accessible followers profile (11).
insert into public.follows(follower_id,followed_id)
select a.id,b.id from friend_review_ids a cross join friend_review_ids b
where (a.n=1 and b.n in(6,11)) or (a.n in(6,7) and b.n=1);
insert into public.void_records(user_id,kind,item_key,payload,updated_at)
select id,'review','filmes:'||(99000000+n),jsonb_build_object(
  'item',jsonb_build_object('id',99000000+n,'categoria','filmes','titulo','Filme '||n),
  'nota',4,'public',true),case when n=2 then now()-interval '31 days' else now() end from friend_review_ids;
-- An accepted friend's private review, tombstone and non-film must not appear.
insert into public.void_records(user_id,kind,item_key,payload)
select id,'review','filmes:99100002','{"item":{"id":99100002,"categoria":"filmes","titulo":"Privada"},"nota":4,"public":false}' from friend_review_ids where n=2;
insert into public.void_records(user_id,kind,item_key,payload)
select id,'review','filmes:99200002',null from friend_review_ids where n=2;
insert into public.void_records(user_id,kind,item_key,payload)
select id,'review','jogos:99000002','{"item":{"id":99000002,"categoria":"jogos","titulo":"Jogo"},"nota":4,"public":true}' from friend_review_ids where n=2;

set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from friend_review_ids where n=1),true);
do $$begin
  if (select array_agg(user_id order by user_id) from public.void_confirmed_friend_reviews())
    is distinct from (select array_agg(id order by id) from friend_review_ids where n in(2,3,11))
  then raise exception 'Confirmed-only or profile/review privacy failed'; end if;
  if (select count(*) from public.void_confirmed_friend_reviews() where payload->'item'->>'titulo' ilike '%Filme 2%')<>1
  then raise exception 'Server title filter/count failed'; end if;
  if (select count(*) from (select * from public.void_confirmed_friend_reviews() order by updated_at desc,user_id desc,item_key desc offset 1 limit 1) page)<>1
  then raise exception 'Server pagination failed'; end if;
end$$;
-- Changing viewer identity must change the actual friendship set.
select set_config('request.jwt.claim.sub',(select id::text from friend_review_ids where n=10),true);
do $$begin
  if (select array_agg(user_id) from public.void_confirmed_friend_reviews())
    is distinct from (select array_agg(id) from friend_review_ids where n=2)
  then raise exception 'Viewer identity isolation failed'; end if;
end$$;
select set_config('request.jwt.claim.sub','',true);
do $$begin
  if exists(select 1 from public.void_confirmed_friend_reviews()) then raise exception 'Missing identity leaked friends'; end if;
end$$;

select set_config('request.jwt.claim.sub',(select id::text from friend_review_ids where n=1),true);
do $$begin
  if (select count(*) from public.void_confirmed_friend_reviews() where updated_at between now()-interval '30 days' and now())<>2
  then raise exception 'Existing rolling review window failed'; end if;
end$$;
delete from public.void_friendships where sender=(select id from friend_review_ids where n=3) and recipient=auth.uid();
do $$begin
  if exists(select 1 from public.void_confirmed_friend_reviews() where user_id=(select id from friend_review_ids where n=3))
  then raise exception 'Revoked friendship still returned reviews'; end if;
end$$;
reset role;
set local role anon;
do $$begin
  begin perform public.void_confirmed_friend_reviews(); raise exception 'Guest may call private friend query';
  exception when insufficient_privilege then null; end;
end$$;
reset role;
rollback;
