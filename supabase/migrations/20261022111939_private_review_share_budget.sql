-- The exposed API runs with caller permissions; privilege stays in a fixed-scope private helper.
create function void_private.review_share_budget() returns void language sql security definer set search_path='' as $$
 select void_private.identity_limit('review-card');
$$;
revoke all on function void_private.review_share_budget() from public,anon,authenticated;
grant usage on schema void_private to anon,authenticated;
grant execute on function void_private.review_share_budget() to anon,authenticated;
create or replace function public.void_review_share_budget() returns void language sql security invoker set search_path='' as $$
 select void_private.review_share_budget();
$$;
revoke all on function public.void_review_share_budget() from public,anon,authenticated;
grant execute on function public.void_review_share_budget() to anon,authenticated;
