-- Sharing activity does not publish the identifier of the linked platform account.
revoke select on public.void_game_activity from anon,authenticated;
grant select(user_id,provider,external_id,playtime_minutes,last_played_at,evidence,achievements,achievement_total,achievement_unlocked,achievement_status,synced_at)
 on public.void_game_activity to anon,authenticated;
