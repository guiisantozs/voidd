begin;
insert into auth.users(id) values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002'),('10000000-0000-4000-8000-000000000003');
insert into public.void_community_profiles(user_id,display_name,username,visibility) values
 ('10000000-0000-4000-8000-000000000001','Ana','ana_fixture','public'),
 ('10000000-0000-4000-8000-000000000002','Bia','bia_fixture','public'),
 ('10000000-0000-4000-8000-000000000003','Caio','caio_fixture','public');
insert into public.void_records(user_id,kind,item_key,payload,created_at) values
 ('10000000-0000-4000-8000-000000000001','review','filmes:41','{"nota":0,"public":true,"data":"2024-02-29","texto":"Review","item":{"id":41,"categoria":"filmes","titulo":"Filme público"}}','2024-03-01T01:00:00Z'),
 ('10000000-0000-4000-8000-000000000001','review','jogos:42','{"nota":4,"public":false,"data":"2024-02-28","item":{"id":42,"categoria":"jogos","titulo":"Jogo privado"}}','2024-03-01T01:00:00Z'),
 ('10000000-0000-4000-8000-000000000001','review','series:43','{"nota":4,"public":true,"item":{"id":43,"categoria":"series","titulo":"Série sem data"}}','2024-03-01T01:00:00Z');
insert into public.lists(id,owner_id,title,visibility) values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Lista pública','public');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
insert into public.list_items(list_id,media_type,external_id,position,snapshot) values('20000000-0000-4000-8000-000000000001','filmes','41',0,'{"id":41,"categoria":"filmes","titulo":"Filme público"}');
insert into public.follows(follower_id,followed_id) values('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');
select void_private.record_profile_event('10000000-0000-4000-8000-000000000001','achievement','fixture-award','{"title":"Conquista de teste"}',true);
do $$begin
 if void_private.profile_consumed_on('{"data":"2024-02-30"}','2024-03-01T01:00:00Z')<>'2024-02-29'::date then raise exception 'Invalid date fallback';end if;
end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$declare data jsonb;begin
 data:=public.void_profile_diary_page(auth.uid(),2024);
 if (data->>'total')::int<>3 then raise exception 'Owner diary count';end if;
 if not data->'days' @> '[{"day":"2024-02-29","total":2}]'::jsonb then raise exception 'Consumption/fallback heatmap date';end if;
end$$;
insert into public.profile_highlights(user_id,slot,kind,entity_id) values
 (auth.uid(),1,'review','filmes:41'),(auth.uid(),2,'review','jogos:42'),(auth.uid(),3,'list','20000000-0000-4000-8000-000000000001');
do $$begin
 begin insert into public.profile_highlights values(auth.uid(),4,'review','series:43');raise exception 'Fourth highlight permitted';exception when check_violation then null;end;
 begin insert into public.profile_highlights values('10000000-0000-4000-8000-000000000002',1,'review','filmes:41');raise exception 'Pin as other owner permitted';exception when insufficient_privilege then null;end;
 begin insert into public.profile_activity_events(user_id,type,entity_id) values(auth.uid(),'achievement','fake');raise exception 'Client forged achievement';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$declare data jsonb;begin
 if (public.void_profile_diary_page('10000000-0000-4000-8000-000000000001',2024)->>'total')::int<>2 then raise exception 'Private diary leak';end if;
 if jsonb_array_length(public.void_profile_highlights('10000000-0000-4000-8000-000000000001'))<>2 then raise exception 'Private pin leak';end if;
 data:=public.void_profile_activity_page('10000000-0000-4000-8000-000000000001');
 if (data->>'total')::int<>5 then raise exception 'Activity sources or privacy wrong: %',data->>'total';end if;
 begin insert into public.profile_highlights values(auth.uid(),1,'review','filmes:41');raise exception 'Pinned someone else review';exception when raise_exception then if sqlerrm<>'INVALID_HIGHLIGHT' then raise;end if;end;
end$$;
insert into public.profile_comments(profile_id,user_id,body) values('10000000-0000-4000-8000-000000000001',auth.uid(),'Recado da Bia');
do $$begin
 for n in 1..4 loop insert into public.profile_comments(profile_id,user_id,body) values('10000000-0000-4000-8000-000000000001',auth.uid(),'Spam teste');end loop;
 begin insert into public.profile_comments(profile_id,user_id,body) values('10000000-0000-4000-8000-000000000001',auth.uid(),'Sexto');raise exception 'Rate limit bypass';exception when raise_exception then if sqlerrm<>'RATE_LIMIT' then raise;end if;end;
end$$;
delete from public.profile_comments where user_id=auth.uid();
do $$begin
 begin insert into public.profile_comments(profile_id,user_id,body) values('10000000-0000-4000-8000-000000000001',auth.uid(),'After delete');raise exception 'Deletion bypassed rate limit';exception when raise_exception then if sqlerrm<>'RATE_LIMIT' then raise;end if;end;
end$$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
insert into public.profile_comments(profile_id,user_id,body) values('10000000-0000-4000-8000-000000000001',auth.uid(),'Recado de Caio');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
delete from public.profile_comments where profile_id='10000000-0000-4000-8000-000000000001';
reset role;
do $$begin if (select count(*) from public.profile_comments)<>1 then raise exception 'Third party deleted comment';end if;end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
delete from public.profile_comments where profile_id=auth.uid();
reset role;
do $$begin if exists(select 1 from public.profile_comments) then raise exception 'Profile owner cannot moderate';end if;end$$;
update public.lists set visibility='private' where id='20000000-0000-4000-8000-000000000001';
update public.void_records set payload=null where item_key='filmes:41';
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$begin
 if jsonb_array_length(public.void_profile_highlights('10000000-0000-4000-8000-000000000001'))<>0 then raise exception 'Stale pin metadata leaked';end if;
 if (public.void_profile_activity_page('10000000-0000-4000-8000-000000000001')->>'total')::int<>3 then raise exception 'Removed activity persisted';end if;
 begin insert into public.profile_comments(profile_id,user_id,body) values('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Anon');raise exception 'Anon inserted';exception when insufficient_privilege then null;end;
end$$;
reset role;
update public.void_community_profiles set visibility='private' where user_id='10000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $$begin
 if (public.void_profile_diary_page('10000000-0000-4000-8000-000000000001',2024)->>'total')::int<>0 then raise exception 'Private profile diary leak';end if;
 if (public.void_profile_activity_page('10000000-0000-4000-8000-000000000001')->>'total')::int<>0 then raise exception 'Private profile activity leak';end if;
 begin insert into public.profile_comments(profile_id,user_id,body) values('10000000-0000-4000-8000-000000000001',auth.uid(),'Forbidden');raise exception 'Private wall write';exception when insufficient_privilege then null;end;
end$$;
reset role;
delete from auth.users where id='10000000-0000-4000-8000-000000000001';
do $$begin if exists(select 1 from public.profile_highlights) or exists(select 1 from public.profile_activity_events) then raise exception 'Account deletion did not cascade';end if;end$$;
rollback;
