-- Isolated development database only; never populate hosted test users.
begin;
create temp table game_notification_ids as select gen_random_uuid() a,gen_random_uuid() b,gen_random_uuid() c,gen_random_uuid() d;
grant select on game_notification_ids to authenticated;
insert into auth.users(id) select a from game_notification_ids union all select b from game_notification_ids union all select c from game_notification_ids union all select d from game_notification_ids;
insert into public.void_community_profiles(user_id,username,display_name) select id,'gn_'||substr(md5(id::text),1,12),'Pessoa' from auth.users on conflict(user_id) do nothing;
insert into public.void_friendships(sender,recipient,status)select a,b,'accepted' from game_notification_ids union all select a,c,'pending' from game_notification_ids;
insert into public.follows(follower_id,followed_id) select d,a from game_notification_ids union all select a,d from game_notification_ids;
insert into public.void_records(user_id,kind,item_key,payload)select a,'review','jogos:999901',jsonb_build_object('item',jsonb_build_object('id',999901,'categoria','jogos','titulo','Jogo público'),'nota',0,'public',true) from game_notification_ids;
do $$begin
 if (select count(*) from public.notifications where type='friend_game_review')<>1 then raise exception 'Friend notification missing or pending/followers included';end if;
 if not exists(select 1 from public.notifications where type='friend_game_review' and user_id=(select b from game_notification_ids)) then raise exception 'Wrong notification recipient';end if;
end$$;
update public.void_records set payload=payload||'{"texto":"Texto editado"}' where item_key='jogos:999901';
do $$begin if (select count(*) from public.notifications where type='friend_game_review')<>1 then raise exception 'Editing sent another alert';end if;end$$;
-- Reviews and author profiles revoke access after delivery.
set local role authenticated;
select set_config('request.jwt.claim.sub',(select b::text from game_notification_ids),true);
do $$begin if (select count(*) from public.notifications where type='friend_game_review')<>1 then raise exception 'Recipient cannot read notification';end if;end$$;
reset role;
update public.void_community_profiles set visibility='private' where user_id=(select a from game_notification_ids);
set local role authenticated;
do $$begin if exists(select 1 from public.notifications where type='friend_game_review') then raise exception 'Private author leaked delivered alert';end if;end$$;
reset role;
update public.void_community_profiles set visibility='public' where user_id=(select a from game_notification_ids);
delete from public.void_friendships where sender=(select a from game_notification_ids) and recipient=(select b from game_notification_ids);
set local role authenticated;
do $$begin if exists(select 1 from public.notifications where type='friend_game_review') then raise exception 'Removed friendship retained friend-only alert';end if;end$$;
reset role;
insert into public.void_friendships(sender,recipient,status)select a,b,'accepted' from game_notification_ids;
insert into public.notification_preferences(user_id,friend_game_review)select b,false from game_notification_ids;
insert into public.void_records(user_id,kind,item_key,payload)select a,'review','jogos:999902',jsonb_build_object('item',jsonb_build_object('id',999902,'categoria','jogos','titulo','Opt-out'),'nota',5,'public',true) from game_notification_ids;
insert into public.void_records(user_id,kind,item_key,payload)select a,'review','jogos:999903',jsonb_build_object('item',jsonb_build_object('id',999903,'categoria','jogos','titulo','Privada'),'nota',5,'public',false) from game_notification_ids;
do $$begin if exists(select 1 from public.notifications where type='friend_game_review' and data->>'item_key' in('jogos:999902','jogos:999903')) then raise exception 'Opt-out or private review ignored';end if;end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select c::text from game_notification_ids),true);
do $$begin if exists(select 1 from public.notifications where type='friend_game_review') then raise exception 'Cross-account inbox leak';end if;end$$;
reset role;
rollback;
