begin;
-- Existing entries remain removable/idempotent after the owner changes descriptive categories.
create or replace function void_private.collaborative_item(target uuid,entry jsonb,present boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare l public.lists;author uuid;n integer;
begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 select * into l from public.lists where id=target for update;
 if not found then raise insufficient_privilege;end if;
 if l.source_key is not null and l.owner_id=auth.uid() then raise exception 'STANDARD_LIST';end if;
 if not void_private.list_participant(target) then raise insufficient_privilege;end if;
 perform void_private.list_limit('list_action');
 if present is null or entry->>'media_type' is null then raise exception 'INVALID_ITEM';end if;
 select added_by into author from public.list_items where list_id=target and media_type=entry->>'media_type' and external_id=entry->>'external_id';
 if present then
  if found then return true;end if;
  if not(entry->>'media_type'=any(l.media_types)) then raise exception 'INVALID_ITEM';end if;
  select min(p) into n from generate_series(0,199) p where not exists(select 1 from public.list_items where list_id=target and position=p);
  if n is null then raise exception 'LIST_LIMIT';end if;
  insert into public.list_items(list_id,media_type,external_id,position,note,snapshot) values(target,entry->>'media_type',entry->>'external_id',n,coalesce(entry->>'note',''),entry->'snapshot');
 else
  if found and auth.uid()<>l.owner_id and author is distinct from auth.uid() then raise insufficient_privilege;end if;
  delete from public.list_items where list_id=target and media_type=entry->>'media_type' and external_id=entry->>'external_id';
 end if;
 return present;
end;$$;
notify pgrst,'reload schema';
commit;
