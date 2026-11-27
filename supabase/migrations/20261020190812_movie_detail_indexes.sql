begin;
create index void_likes_record_fk on public.void_review_likes(review_user,review_kind,item_key);
create index void_comments_record_fk on public.void_review_comments(review_user,review_kind,item_key);
-- Explicit deny policy documents that only the private trigger can access limits.
create policy write_limits_no_client_access on void_private.write_limits for all to anon,authenticated using(false) with check(false);
commit;
