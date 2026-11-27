-- Preserve existing notifications and trigger bindings; support valid dotted usernames.
begin;

create or replace function void_private.notification_review() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid;owner_id uuid;item text;source_text text;details jsonb;review_payload jsonb;target uuid;handle text;event_id text;event_kind text;
begin
 if tg_table_name='void_records' then
  if tg_op='DELETE' then
   if old.kind='review' then delete from public.notifications where entity_id=old.user_id||'/'||old.item_key;end if;return old;
  end if;
  if new.kind<>'review' then return new;end if;
  if new.payload is null then delete from public.notifications where entity_id=new.user_id||'/'||new.item_key;return new;end if;
  actor:=new.user_id;owner_id:=new.user_id;item:=new.item_key;review_payload:=new.payload;source_text:=new.payload->>'texto';event_id:='review:'||actor||':'||item;
 else
  if tg_op='DELETE' then
   if tg_table_name='void_review_likes' then
    delete from public.notifications where type='review_like' and actor_id=old.user_id and entity_id=old.review_user||'/'||old.item_key;
   else delete from public.notifications where data->>'comment_id'=old.id::text;end if;return old;
  end if;
  actor:=new.user_id;owner_id:=new.review_user;item:=new.item_key;
  select payload into review_payload from public.void_records where user_id=owner_id and kind='review' and item_key=item;
  if tg_table_name='void_review_comments' then source_text:=new.body;event_id:='comment:'||new.id;event_kind:='review_comment';
  else event_id:='like:'||actor||':'||owner_id||':'||item;event_kind:='review_like';end if;
 end if;
 details:=jsonb_build_object('review_user',owner_id,'item_key',item,'title',left(review_payload->'item'->>'titulo',180),'poster',review_payload->'item'->>'poster');
 if tg_table_name='void_review_comments' then details:=details||jsonb_build_object('comment_id',new.id);end if;
 if event_kind is not null then perform void_private.notify(owner_id,actor,event_kind,'review',owner_id||'/'||item,details,event_id);end if;
 for handle in select distinct lower(m[2]) from regexp_matches(coalesce(source_text,''),'(^|[^a-zA-Z0-9_.@])@([a-zA-Z0-9_]+(?:[.][a-zA-Z0-9_]+)*)','g') m loop
  select user_id into target from public.void_community_profiles where username=handle;
  perform void_private.notify(target,actor,'mention','review',owner_id||'/'||item,details,event_id||':mention:'||handle);
 end loop;
 if tg_table_name='void_records' and item like 'filmes:%' then
  -- Membership is private to each recipient; no list title/membership enters data.
  for target in select w.user_id from public.void_records w where w.kind='watchlist' and w.item_key=split_part(item,':',2) and w.payload is not null and w.user_id<>actor and
   (exists(select 1 from public.void_friendships f where f.status='accepted' and ((f.sender=actor and f.recipient=w.user_id) or (f.recipient=actor and f.sender=w.user_id)))
    or (exists(select 1 from public.follows where follower_id=actor and followed_id=w.user_id) and exists(select 1 from public.follows where follower_id=w.user_id and followed_id=actor))) loop
   perform void_private.notify(target,actor,'watchlist_review','review',owner_id||'/'||item,details,event_id||':watchlist');
  end loop;
 end if;
 return new;
end;$$;

revoke all on function void_private.notification_review() from public,anon,authenticated;

commit;
