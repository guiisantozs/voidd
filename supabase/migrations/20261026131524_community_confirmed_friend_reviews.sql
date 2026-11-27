begin;

-- Separate from void_detail_friend_ids(): mutual follows are not confirmed
-- invitations. All records and profile visibility remain subject to caller RLS.
create function public.void_confirmed_friend_reviews()
returns setof public.void_records
language sql stable security invoker set search_path = '' as $$
  select r.* from public.void_records r
  where (select auth.uid()) is not null
    and r.kind = 'review' and r.is_public and r.payload is not null
    and r.item_key like 'filmes:%'
    and exists (
      select 1 from public.void_friendships f
      where f.status = 'accepted' and (
        (f.sender = (select auth.uid()) and f.recipient = r.user_id)
        or (f.recipient = (select auth.uid()) and f.sender = r.user_id)
      )
    );
$$;

revoke all on function public.void_confirmed_friend_reviews() from public, anon, authenticated;
grant execute on function public.void_confirmed_friend_reviews() to authenticated;
comment on function public.void_confirmed_friend_reviews() is
  'Public movie reviews by accepted invitation friends of auth.uid(); caller RLS applies. Search, count, time window and pagination are applied by PostgREST.';

notify pgrst, 'reload schema';
commit;
