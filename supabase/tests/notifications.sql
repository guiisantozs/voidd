-- DEVELOPMENT DATABASE ONLY. Synthetic accounts; all changes rolled back.
begin;
create temp table notification_test_ids as select gen_random_uuid() a,gen_random_uuid() b,gen_random_uuid() c;
grant select on notification_test_ids to authenticated;
insert into auth.users(id) select a from notification_test_ids union all select b from notification_test_ids union all select c from notification_test_ids;
insert into public.void_community_profiles(user_id,username,display_name) select a,'nt_'||substr(md5(a::text),1,12),'Ana' from notification_test_ids union all select b,'nt_'||substr(md5(b::text),1,12),'Bia' from notification_test_ids union all select c,'nt_'||substr(md5(c::text),1,12),'Caio' from notification_test_ids on conflict(user_id) do update set username=excluded.username,display_name=excluded.display_name,visibility='public';
insert into public.void_friendships(sender,recipient,status) select a,b,'pending' from notification_test_ids;
do $$begin if (select count(*) from public.notifications where type='friend_request')<>1 then raise exception 'Missing invite';end if;end$$;
update public.void_friendships set status='accepted' where sender=(select a from notification_test_ids);
do $$begin
 if exists(select 1 from public.notifications where type='friend_request') then raise exception 'Stale invitation';end if;
 if (select count(*) from public.notifications where type='friend_accepted')<>1 then raise exception 'Missing acceptance';end if;
end$$;
insert into public.follows(follower_id,followed_id) select a,b from notification_test_ids;
insert into public.void_records(user_id,kind,item_key,payload) select b,'watchlist','99000001','{"item":{"titulo":"Teste","id":99000001,"categoria":"filmes"}}' from notification_test_ids;
insert into public.void_records(user_id,kind,item_key,payload) select a,'review','filmes:99000001',jsonb_build_object('item',jsonb_build_object('titulo','Teste','id',99000001,'categoria','filmes'),'nota',4,'public',true,'texto','Olá @'||p.username) from notification_test_ids i join public.void_community_profiles p on p.user_id=i.c;
do $$begin
 if (select count(*) from public.notifications where type='watchlist_review')<>1 then raise exception 'Numeric watchlist key not matched';end if;
 if (select count(*) from public.notifications where type='mention')<>1 then raise exception 'Missing review mention';end if;
 if exists(select 1 from public.notifications where actor_id=user_id) then raise exception 'Self notification';end if;
end$$;
insert into public.void_review_likes(user_id,review_user,item_key) select b,a,'filmes:99000001' from notification_test_ids;
do $$begin if (select count(*) from public.notifications where type='review_like')<>1 then raise exception 'Missing like';end if;end$$;
delete from public.void_review_likes where user_id=(select b from notification_test_ids);
do $$begin if exists(select 1 from public.notifications where type='review_like') then raise exception 'Undone like still present';end if;end$$;
insert into public.void_review_likes(user_id,review_user,item_key) select b,a,'filmes:99000001' from notification_test_ids;
do $$begin if exists(select 1 from public.notifications where type='review_like') then raise exception 'Relike duplicate';end if;end$$;
insert into public.void_review_likes(user_id,review_user,item_key) select a,a,'filmes:99000001' from notification_test_ids;
insert into public.void_review_comments(user_id,review_user,item_key,body) select b,a,'filmes:99000001','Resposta @'||p.username from notification_test_ids i join public.void_community_profiles p on p.user_id=i.c;
do $$begin if (select count(*) from public.notifications where type='review_comment')<>1 or (select count(*) from public.notifications where type='mention')<>2 then raise exception 'Comment/mention missing';end if;end$$;
delete from public.void_review_comments where user_id=(select b from notification_test_ids);
do $$begin if exists(select 1 from public.notifications where data ? 'comment_id') then raise exception 'Deleted comment leaked';end if;end$$;
insert into public.notification_preferences(user_id,review_like,mention) select a,false,false from notification_test_ids;
-- Dotted handles must resolve the entire username, including sentence punctuation.
update public.void_community_profiles set username='nt.'||substr(md5(c::text),1,12) from notification_test_ids where user_id=c;
insert into public.void_records(user_id,kind,item_key,payload)
select a,'review','filmes:99000003',jsonb_build_object('item',jsonb_build_object('titulo','Menção com ponto','id',99000003,'categoria','filmes'),'nota',4,'public',true,'texto','Olá @'||p.username||'.')
from notification_test_ids i join public.void_community_profiles p on p.user_id=i.c;
do $$begin
 if not exists(select 1 from public.notifications where type='mention' and user_id=(select c from notification_test_ids) and entity_id=(select a::text||'/filmes:99000003' from notification_test_ids)) then raise exception 'Dotted review mention missing';end if;
end$$;
insert into public.void_review_comments(user_id,review_user,item_key,body)
select b,a,'filmes:99000003','Resposta @'||p.username||'!'
from notification_test_ids i join public.void_community_profiles p on p.user_id=i.c;
do $$begin
 if not exists(select 1 from public.notifications where type='mention' and user_id=(select c from notification_test_ids) and data ? 'comment_id') then raise exception 'Dotted comment mention missing';end if;
end$$;
insert into public.void_review_likes(user_id,review_user,item_key) select c,a,'filmes:99000001' from notification_test_ids;
do $$begin if exists(select 1 from public.notifications where type='review_like') then raise exception 'Disabled preference ignored';end if;end$$;
-- Private review cannot disclose its title to the mentioned account.
insert into public.void_records(user_id,kind,item_key,payload) select a,'review','filmes:99000002',jsonb_build_object('item',jsonb_build_object('titulo','SECRET','id',99000002,'categoria','filmes'),'nota',4,'public',false,'texto','@'||p.username) from notification_test_ids i join public.void_community_profiles p on p.user_id=i.c;
do $$begin if exists(select 1 from public.notifications where data->>'title'='SECRET') then raise exception 'Private review leaked';end if;end$$;
-- A later visibility change must revoke previously delivered content too.
update public.void_community_profiles set visibility='private' where user_id=(select a from notification_test_ids);
set local role authenticated;
select set_config('request.jwt.claim.sub',(select b::text from notification_test_ids),true);
do $$begin
 if exists(select 1 from public.notifications where user_id<>auth.uid()) then raise exception 'Cross-account read';end if;
 if exists(select 1 from public.notifications where entity_type='review') then raise exception 'Profile revocation leaked';end if;
 begin insert into public.notifications(user_id,type,entity_type,entity_id) values(auth.uid(),'follower','profile','forged');raise exception 'Client inserted notification';exception when insufficient_privilege then null;end;
 begin update public.notifications set data='{}';raise exception 'Client changed content';exception when insufficient_privilege then null;end;
 begin perform void_private.notify(auth.uid(),null,'achievement','achievement','fake','{}','fake');raise exception 'Client invoked generator';exception when insufficient_privilege then null;end;
 begin insert into public.notification_preferences(user_id) select c from notification_test_ids;raise exception 'Cross-account preference write';exception when insufficient_privilege then null;end;
 update public.notifications set read_at=now() where read_at is null;
 if exists(select 1 from public.notifications where read_at is null) then raise exception 'Read update failed';end if;
 delete from public.notifications where user_id<>(select b from notification_test_ids);
end$$;
reset role;
update public.void_community_profiles set visibility='followers' where user_id=(select a from notification_test_ids);
insert into public.follows(follower_id,followed_id) select b,a from notification_test_ids;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select b::text from notification_test_ids),true);
do $$begin if not exists(select 1 from public.notifications where type='watchlist_review') then raise exception 'Follower access missing';end if;end$$;
reset role;
delete from public.follows where follower_id=(select b from notification_test_ids) and followed_id=(select a from notification_test_ids);
set local role authenticated;
do $$begin if exists(select 1 from public.notifications where entity_type='review') then raise exception 'Unfollow did not revoke';end if;end$$;
reset role;
-- No inserts for a tombstone; remove all notices pointing at the removed review.
update public.void_records set payload=null where kind='review' and user_id=(select a from notification_test_ids);
do $$begin if exists(select 1 from public.notifications where entity_type='review') then raise exception 'Tombstone notification';end if;end$$;
update public.notifications set created_at=now()-interval '91 days';
insert into public.follows(follower_id,followed_id) select c,b from notification_test_ids;
do $$begin if exists(select 1 from public.notifications where created_at<now()-interval '90 days') then raise exception 'Retention failed';end if;end$$;
delete from auth.users where id=(select c from notification_test_ids);
do $$begin if exists(select 1 from public.notifications where actor_id=(select c from notification_test_ids) or user_id=(select c from notification_test_ids)) then raise exception 'Deleted user left notifications';end if;end$$;
rollback;
