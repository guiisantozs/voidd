begin;
-- Count whitespace too: padding cannot bypass the server-side size limit.
alter table public.void_review_comments add constraint comments_body_max_length check(length(body)<=1000);
alter table public.void_review_reports add constraint reports_reason_max_length check(length(reason)<=500);
commit;
