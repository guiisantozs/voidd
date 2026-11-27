begin;
-- Preserve existing preferences and notification types; no historical delivery.
alter table public.notification_preferences add column friend_game_review boolean not null default true;
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check(type in('friend_request','friend_accepted','follower','review_like','review_comment','mention','achievement','watchlist_review','list_invite','friend_game_review'));

-- A private trigger is necessary to reach each recipient's protected inbox.
-- It is never exposed as a client RPC and delegates privacy, opt-out and
-- deduplication to the existing notification generator.
create function void_private.notification_friend_game_review() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 if new.kind<>'review' or new.item_key !~ '^jogos:[1-9][0-9]*$' or new.payload is null or not new.is_public then return new;end if;
 if tg_op='UPDATE' and old.is_public then return new;end if;
 for recipient in select case when f.sender=new.user_id then f.recipient else f.sender end
  from public.void_friendships f where f.status='accepted' and new.user_id in(f.sender,f.recipient)
 loop
  perform void_private.notify(recipient,new.user_id,'friend_game_review','review',new.user_id||'/'||new.item_key,
   jsonb_build_object('review_user',new.user_id,'item_key',new.item_key,'title',left(new.payload->'item'->>'titulo',180)),
   'friend-game-review:'||new.user_id||':'||new.item_key);
 end loop;
 return new;
end;$$;
revoke all on function void_private.notification_friend_game_review() from public,anon,authenticated;
create trigger notification_friend_game_review after insert or update on public.void_records for each row execute function void_private.notification_friend_game_review();

-- Removing an accepted friendship also revokes this friend-only inbox item.
-- Other notification types keep their existing visibility policies.
create policy friend_game_notification_read on public.notifications as restrictive for select to authenticated using(
 type<>'friend_game_review' or exists(select 1 from public.void_friendships f where f.status='accepted'
  and ((f.sender=(select auth.uid()) and f.recipient=notifications.actor_id) or (f.recipient=(select auth.uid()) and f.sender=notifications.actor_id)))
);
notify pgrst,'reload schema';
commit;
