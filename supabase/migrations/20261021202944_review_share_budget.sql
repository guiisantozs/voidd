-- Reuse the existing persistent limiter; no new table or authorization bypass.
create function public.void_review_share_budget() returns void language sql security definer set search_path='' as $$
 select void_private.identity_limit('review-card');
$$;
revoke all on function public.void_review_share_budget() from public,anon,authenticated;
grant execute on function public.void_review_share_budget() to anon,authenticated;
