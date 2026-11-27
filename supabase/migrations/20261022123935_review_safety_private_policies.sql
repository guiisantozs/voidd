begin;
create policy review_release_archive_closed on void_private.review_release_archive for all to anon,authenticated using(false) with check(false);
create policy prohibited_names_closed on void_private.prohibited_names for all to anon,authenticated using(false) with check(false);
create policy profile_name_flags_closed on void_private.profile_name_flags for all to anon,authenticated using(false) with check(false);
commit;
