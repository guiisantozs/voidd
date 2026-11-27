begin;
-- Serialize contact blocks with recommendations and membership decisions. Lock
-- all involved identities in UUID order, BEFORE locking the list, to avoid
-- deadlocks between multi-recipient sends or concurrent list invitations.
-- Internal locking primitive only: no table access, no client EXECUTE grant.
create function void_private.social_lock_contacts(people uuid[]) returns void language plpgsql security invoker set search_path='' as $$
declare person uuid;
begin
 if cardinality(people)>21 then raise exception 'INVALID_QUERY';end if;
 for person in select distinct id from unnest(people)id where id is not null order by id loop
  perform pg_advisory_xact_lock(hashtextextended(person::text,43));
 end loop;
end;$$;
revoke all on function void_private.social_lock_contacts(uuid[]) from public,anon,authenticated;
create function void_private.social_block_lock() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform void_private.social_lock_contacts(array[new.blocker_id,new.blocked_id]);
 return new;
end;$$;
revoke all on function void_private.social_block_lock() from public,anon,authenticated;
create trigger social_block_lock before insert on public.user_blocks for each row execute function void_private.social_block_lock();

create or replace function void_private.list_invitation(target uuid,person uuid,action text) returns void language plpgsql security definer set search_path='' as $$
declare other uuid;
begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 select case when owner_id=auth.uid() then person else owner_id end into other from public.lists where id=target;
 perform void_private.social_lock_contacts(array[auth.uid(),other]);
 if action in('invite','accept') and void_private.social_blocked(other) then raise insufficient_privilege;end if;
 perform void_private.list_invitation_base(target,person,action);
end;$$;

create or replace function void_private.social_join_link(invite_token text,join_now boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.lists;member_status text;owner uuid;
begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 if invite_token is null or invite_token !~ '^[a-f0-9]{64}$' or join_now is null then raise exception 'INVALID_INVITE';end if;
 select x.owner_id into owner from public.lists x join public.list_invite_links k on k.list_id=x.id where k.token=invite_token and k.enabled and x.collaboration_enabled and x.source_key is null;
 if owner is null then raise exception 'INVALID_INVITE';end if;
 perform void_private.social_lock_contacts(array[auth.uid(),owner]);
 select x.* into l from public.lists x join public.list_invite_links k on k.list_id=x.id where k.token=invite_token and k.enabled and x.collaboration_enabled and x.source_key is null for update of x;
 -- Recheck under the parent lock: rotations/disable serialize with joining.
 if not found or not exists(select 1 from public.list_invite_links where list_id=l.id and token=invite_token and enabled) or void_private.social_blocked(l.owner_id) then raise exception 'INVALID_INVITE';end if;
 perform void_private.list_limit('list_action');
 select status into member_status from public.list_members where list_id=l.id and user_id=auth.uid();
 if member_status in('removed','declined') then raise exception 'INVALID_INVITE';end if;
 if join_now and auth.uid()<>l.owner_id and member_status is distinct from 'accepted' then
  perform void_private.require_social_identity();
  insert into public.list_members(list_id,user_id,status,responded_at,joined_at) values(l.id,auth.uid(),'accepted',now(),now()) on conflict(list_id,user_id) do update set status='accepted',responded_at=now(),joined_at=now();
  member_status:='accepted';
 end if;
 return jsonb_build_object('id',l.id,'title',l.title,'description',l.description,'visibility',l.visibility,'joined',auth.uid()=l.owner_id or member_status='accepted','owner',(select jsonb_build_object('user_id',p.user_id,'display_name',p.display_name,'username',p.username,'avatar_url',p.avatar_url,'avatar_id',p.avatar_id) from public.void_community_profiles p where p.user_id=l.owner_id));
end;$$;

create or replace function void_private.social_recommend(entry jsonb,recipients uuid[],note text) returns jsonb language plpgsql security definer set search_path='' as $$
declare person uuid;work jsonb;record_id uuid;sent integer:=0;used integer;title text;poster text;
begin
 perform void_private.require_social_identity();
 if recipients is null or cardinality(recipients) not between 1 and 20 or length(coalesce(note,''))>500 or entry is null or (entry->>'media_type') is null or entry->>'media_type' not in('filmes','series','jogos','animes') or (entry->>'external_id') is null or entry->>'external_id' !~ '^[1-9][0-9]{0,14}$' then raise exception 'INVALID_RECOMMENDATION';end if;
 title:=void_private.list_text(entry->'snapshot'->>'titulo');poster:=coalesce(entry->'snapshot'->>'poster','');
 if length(coalesce(title,'')) not between 1 and 200 or length(poster)>1000 or (poster<>'' and poster !~ '^https://[^[:space:]"<>\\]+$') or length(coalesce(entry->'snapshot'->>'ano',''))>20 then raise exception 'INVALID_ITEM';end if;
 work:=jsonb_build_object('id',entry->>'external_id','categoria',entry->>'media_type','titulo',title,'poster',poster,'ano',void_private.list_text(entry->'snapshot'->>'ano'));
 -- Lock the actor and every recipient in a globally stable order.
 perform void_private.social_lock_contacts(array_append(recipients,auth.uid()));
 foreach person in array recipients loop
  if person is null or not void_private.social_friend(person) then raise insufficient_privilege;end if;
 end loop;
 for person in select distinct unnest(recipients) loop
  insert into public.work_recommendations(sender_id,recipient_id,media_type,external_id,snapshot,message) values(auth.uid(),person,entry->>'media_type',entry->>'external_id',work,void_private.list_text(note)) on conflict do nothing returning id into record_id;
  if record_id is not null then
   insert into void_private.write_limits as w(user_id,action,bucket,n) values(auth.uid(),'work_recommendation',date_trunc('hour',clock_timestamp() at time zone 'UTC') at time zone 'UTC',1) on conflict(user_id,action) do update set bucket=excluded.bucket,n=case when w.bucket=excluded.bucket then w.n+1 else 1 end returning n into used;
   if used>40 then raise exception 'RATE_LIMIT';end if;
   perform void_private.notify(person,auth.uid(),'work_recommendation','recommendation',record_id::text,jsonb_build_object('work',work,'title',title,'message',void_private.list_text(note)),'recommendation:'||record_id);
   sent:=sent+1;
  end if;
 end loop;
 return jsonb_build_object('sent',sent);
end;$$;
notify pgrst,'reload schema';
commit;
