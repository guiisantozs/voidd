-- The shared SELECT policy already includes the owner. Keep owner writes separate
-- so authenticated reads do not evaluate two permissive policies for the same row.
drop policy collection_preferences_owner on public.void_collection_preferences;
create policy collection_preferences_insert on public.void_collection_preferences for insert to authenticated
 with check(user_id=(select auth.uid()));
create policy collection_preferences_update on public.void_collection_preferences for update to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy collection_preferences_delete on public.void_collection_preferences for delete to authenticated
 using(user_id=(select auth.uid()));
