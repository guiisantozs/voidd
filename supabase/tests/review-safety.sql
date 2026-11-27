begin;
do $$declare bad text;good text;begin
 foreach bad in array array['CARALHO','caralho123','c4r4lh0123','c4r4lh0','c.a.r.a.l.h.o','c a r a l h o','caaaraaalho','Seu filho da puta','HEIL HITLER','vou te matar'] loop
  if public.void_name_check(bad) then raise exception 'Prohibited name accepted: %',bad;end if;
 end loop;
 foreach good in array array['Ana Clara','Carolina','Carvalho','Cassiano','Putativa','Computador','João da Silva','Hit','A Putaia'] loop
  if not public.void_name_check(good) then raise exception 'Common name rejected: %',good;end if;
 end loop;
 if (select count(*) from void_private.profile_name_flags where resolved_at is null)<>2 then raise exception 'Legacy flags missing';end if;
end$$;
-- Authoritative facts: past, future and unconfirmed release.
insert into public.void_movie_releases(movie_id,release_date,release_status) values
 (99000001,(now() at time zone 'America/Sao_Paulo')::date-1,'Released'),
 (99000002,(now() at time zone 'America/Sao_Paulo')::date+1,'Post Production'),(99000003,null,'In Production');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$begin
 begin insert into public.void_movie_releases(movie_id,release_date) values(99000004,'2000-01-01');raise exception 'Client forged release';exception when insufficient_privilege then null;end;
 begin update public.void_community_profiles set display_name='c4r4lh0' where user_id=auth.uid();raise exception 'Bad display accepted';exception when check_violation then null;end;
 begin update public.void_community_profiles set username='caralho' where user_id=auth.uid();raise exception 'Bad username accepted';exception when check_violation then null;end;
 begin update public.void_profiles set display_name='c.a.r.a.l.h.o' where user_id=auth.uid();raise exception 'Private account bypass';exception when check_violation then null;end;
 begin insert into public.void_records(user_id,kind,item_key,payload) values(auth.uid(),'review','filmes:99000002','{"item":{"titulo":"Future","estreia":"2000-01-01"},"nota":5,"public":true}');raise exception 'Forged payload release accepted';exception when check_violation then null;end;
 begin insert into public.void_records(user_id,kind,item_key,payload) values(auth.uid(),'review','filmes:99000003','{"item":{"titulo":"Unknown"},"nota":5,"public":true}');raise exception 'Unconfirmed film accepted';exception when check_violation then null;end;
 insert into public.void_records(user_id,kind,item_key,payload) values(auth.uid(),'review','filmes:99000001','{"item":{"titulo":"Released"},"nota":4,"public":true}');
 update public.void_records set payload=jsonb_set(payload,'{nota}','3') where user_id=auth.uid() and item_key='filmes:99000001';
 if (select count(*) from public.void_records where kind='review')<>1 then raise exception 'Duplicate review';end if;
 if (select avg((payload->>'nota')::numeric) from public.void_records where is_public)<>3 then raise exception 'Updated average';end if;
end$$;
-- Flagged account cannot bypass onboarding via a direct record write.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$begin
 begin insert into public.void_records(user_id,kind,item_key,payload) values(auth.uid(),'watchlist','99000001','{"item":{"titulo":"Saved"}}');raise exception 'Flagged user bypassed gate';exception when insufficient_privilege then null;end;
 perform public.void_profile_name_correct('bia_test','Bia');
 if (public.void_username_self()->>'username_required')::boolean then raise exception 'Username flag unresolved';end if;
end$$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
do $$declare before_time timestamptz;begin
 select username_changed_at into before_time from public.void_community_profiles where user_id=auth.uid();
 perform public.void_profile_name_correct('caio_test','Caio');
 if (select username_changed_at from public.void_community_profiles where user_id=auth.uid()) is distinct from before_time then raise exception 'Display correction consumed username change';end if;
 if (public.void_username_self()->>'display_required')::boolean or (public.void_username_self()->>'account_display_required')::boolean then raise exception 'Display flag unresolved';end if;
end$$;
reset role;
do $$begin
 begin insert into auth.users(id,raw_user_meta_data,raw_app_meta_data) values(gen_random_uuid(),'{"username":"valid_test","display_name":"c4r4lh0"}','{"provider":"email"}');raise exception 'Signup accepted prohibited name';exception when check_violation then null;end;
end$$;
-- Date threshold reopens automatically; no schedule required.
update public.void_movie_releases set release_date=(now() at time zone 'America/Sao_Paulo')::date where movie_id=99000002;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
insert into public.void_records(user_id,kind,item_key,payload) values(auth.uid(),'review','filmes:99000002','{"item":{"titulo":"Now released"},"nota":5,"public":true}');
reset role;
update public.void_movie_releases set release_date=(now() at time zone 'America/Sao_Paulo')::date+1 where movie_id=99000002;
do $$begin
 if void_private.quarantine_unreleased_reviews()<>1 then raise exception 'Quarantine wrong count';end if;
 if (select count(*) from void_private.review_release_archive)<>1 then raise exception 'Backup missing';end if;
 if (select count(*) from public.void_records where is_public)<>1 then raise exception 'Public count not recalculated';end if;
 if (select avg((payload->>'nota')::numeric) from public.void_records where is_public)<>3 then raise exception 'Average not recalculated';end if;
 if void_private.quarantine_unreleased_reviews()<>0 then raise exception 'Quarantine not idempotent';end if;
end$$;
update public.void_movie_releases set release_date=(now() at time zone 'America/Sao_Paulo')::date where movie_id=99000002;
do $$begin
 if not void_private.restore_release_review('00000000-0000-4000-8000-000000000001','filmes:99000002') then raise exception 'Restore failed';end if;
 if (select count(*) from public.void_records where is_public)<>2 then raise exception 'Restored stats wrong';end if;
end$$;
rollback;
