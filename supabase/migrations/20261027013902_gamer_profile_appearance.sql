-- Independent gamer appearance; never modifies the community/film profile banner.
alter table public.void_collection_preferences add column gamer_banner jsonb,add column favorite_game jsonb;
alter table public.void_collection_preferences add constraint gamer_banner_object check(gamer_banner is null or (jsonb_typeof(gamer_banner)='object' and octet_length(gamer_banner::text)<12000));
alter table public.void_collection_preferences add constraint favorite_game_object check(favorite_game is null or (jsonb_typeof(favorite_game)='object' and octet_length(favorite_game::text)<12000));

-- Existing privacy writes remain available, but appearance is resolved by the server.
revoke insert,update on public.void_collection_preferences from authenticated;
grant insert(user_id,visibility),update(user_id,visibility) on public.void_collection_preferences to authenticated;
grant select on public.void_collection_preferences to anon;
create policy collection_appearance_visible on public.void_collection_preferences for select to anon,authenticated
 using(void_private.can_view_collection(user_id));
