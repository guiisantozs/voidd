-- Add anime watchlists and preferences without rewriting existing records.
begin;
alter table public.void_records drop constraint void_records_kind_check;
alter table public.void_records add constraint void_records_kind_check check(kind in('review','library','watchlist','series_watchlist','anime_watchlist'));
alter table public.void_records drop constraint valid_item_key;
alter table public.void_records add constraint valid_item_key check(
 (kind='review' and item_key ~ '^(filmes|series|animes|jogos):[1-9][0-9]*$') or
 (kind in('library','watchlist','series_watchlist','anime_watchlist') and item_key ~ '^[1-9][0-9]*$'));
alter table public.void_records drop constraint payload_shape;
alter table public.void_records add constraint payload_shape check(payload is null or (
 jsonb_typeof(payload)='object' and jsonb_typeof(payload->'item')='object'
 and jsonb_typeof(payload->'item'->'titulo')='string'
 and case
 when kind in('watchlist','series_watchlist','anime_watchlist') then payload->'item'->>'categoria'=case kind when 'watchlist' then 'filmes' when 'series_watchlist' then 'series' else 'animes' end and payload->'item'->>'id'=item_key
 when kind='library' then payload->>'status' in('want','playing','finished','paused') and payload->'item'->>'categoria'='jogos' and payload->'item'->>'id'=item_key
 else jsonb_typeof(payload->'nota')='number' and coalesce((payload->>'ratingScale')::numeric,5)=5 and (payload->>'nota')::numeric between 0 and 5 and mod((payload->>'nota')::numeric*10,1)=0
 and char_length(coalesce(payload->>'texto',''))<=2000
 and concat(payload->'item'->>'categoria',':',payload->'item'->>'id')=item_key end) is true);

alter table public.lists drop constraint lists_source_key_check;
alter table public.lists add constraint lists_source_key_check check(source_key is null or source_key in('watchlist','series_watchlist','anime_watchlist'));
create or replace function void_private.standard_list_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' then
  if old.source_key is not null and auth.uid() is not null then raise exception 'STANDARD_LIST';end if;
  return old;
 end if;
 if tg_op='UPDATE' and new.source_key is distinct from old.source_key then raise exception 'STANDARD_LIST';end if;
 if new.source_key in('watchlist','series_watchlist','anime_watchlist') then
  new.media_types:=case new.source_key when 'watchlist' then array['filmes'] when 'series_watchlist' then array['series'] else array['animes'] end;
  new.ranked:=false;
 end if;
 return new;
end;$$;
revoke all on function void_private.standard_list_guard() from public,anon,authenticated;
create policy anime_watchlist_shared_read on public.void_records for select to anon,authenticated using(
 kind='anime_watchlist' and payload is not null and exists(
  select 1 from public.lists l where l.owner_id=void_records.user_id and l.source_key='anime_watchlist')
);
create or replace view public.void_list_entries with(security_invoker=true) as
 select i.list_id,i.media_type,i.external_id,i.position::bigint,i.note,i.snapshot,i.added_at from public.list_items i
 union all
 select l.id,case l.source_key when 'watchlist' then 'filmes' when 'series_watchlist' then 'series' else 'animes' end,r.item_key,
 row_number() over(partition by l.id order by r.item_key)-1,''::text,
 jsonb_build_object('id',r.item_key,'categoria',case l.source_key when 'watchlist' then 'filmes' when 'series_watchlist' then 'series' else 'animes' end,'titulo',r.payload->'item'->>'titulo','poster',r.payload->'item'->>'poster','ano',r.payload->'item'->>'ano','provider',r.payload->'item'->>'provider','providerId',r.payload->'item'->>'providerId'),l.created_at
 from public.lists l join public.void_records r on r.user_id=l.owner_id and r.kind=l.source_key and r.payload is not null
 where l.source_key in('watchlist','series_watchlist','anime_watchlist');
revoke all on public.void_list_entries from public,anon,authenticated;
grant select on public.void_list_entries to anon,authenticated;
create function public.void_anime_watchlist_edit() returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 select id into result from public.lists where owner_id=auth.uid() and source_key='anime_watchlist';
 if result is null then
  insert into public.lists(owner_id,title,description,visibility,ranked,media_types,source_key)
  values(auth.uid(),'Quero assistir','Os animes que você guardou para a próxima maratona.','private',false,array['animes'],'anime_watchlist')
  on conflict(owner_id,source_key) where source_key is not null do nothing returning id into result;
  if result is null then select id into result from public.lists where owner_id=auth.uid() and source_key='anime_watchlist';end if;
 end if;
 return result;
end;$$;
revoke all on function public.void_anime_watchlist_edit() from public,anon,authenticated;
grant execute on function public.void_anime_watchlist_edit() to authenticated;

create table public.void_anime_preferences(
 user_id uuid primary key references auth.users(id) on delete cascade,
 anime_ids bigint[] not null check(array_ndims(anime_ids)=1 and array_lower(anime_ids,1)=1 and cardinality(anime_ids)=3 and array_position(anime_ids,null) is null and anime_ids[1]<>anime_ids[2] and anime_ids[1]<>anime_ids[3] and anime_ids[2]<>anime_ids[3] and 9000000000<all(anime_ids) and 10000000000>all(anime_ids)),
 updated_at timestamptz not null default now()
);
alter table public.void_anime_preferences enable row level security;
revoke all on public.void_anime_preferences from public,anon,authenticated;
grant select,delete on public.void_anime_preferences to authenticated;
grant insert(user_id,anime_ids),update(user_id,anime_ids) on public.void_anime_preferences to authenticated;
grant all on public.void_anime_preferences to service_role;
create policy anime_preferences_read on public.void_anime_preferences for select to authenticated using(user_id=(select auth.uid()));
create policy anime_preferences_insert on public.void_anime_preferences for insert to authenticated with check(user_id=(select auth.uid()));
create policy anime_preferences_update on public.void_anime_preferences for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy anime_preferences_delete on public.void_anime_preferences for delete to authenticated using(user_id=(select auth.uid()));
create trigger anime_preferences_updated before update on public.void_anime_preferences for each row execute function public.void_touch_updated_at();
create trigger anime_preferences_rate before insert or update on public.void_anime_preferences for each row execute function void_private.review_write_limit();
alter table public.void_review_likes drop constraint void_review_likes_item_key_check;
alter table public.void_review_likes add constraint void_review_likes_item_key_check check(item_key ~ '^(filmes|jogos|series|animes):[1-9][0-9]*$');
alter table public.void_review_comments drop constraint void_review_comments_item_key_check;
alter table public.void_review_comments add constraint void_review_comments_item_key_check check(item_key ~ '^(filmes|jogos|series|animes):[1-9][0-9]*$');
alter table public.void_review_reports drop constraint void_review_reports_item_key_check;
alter table public.void_review_reports add constraint void_review_reports_item_key_check check(item_key ~ '^(filmes|series|animes):[1-9][0-9]*$');
notify pgrst,'reload schema';
commit;
