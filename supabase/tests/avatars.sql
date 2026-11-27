begin;
insert into public.avatars(id,slug,character_name,media_type,media_id,media_title,image_path,is_published)
 values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','kratos-one','Kratos','jogos','58175','God of War','kratos-one/0123456789abcdef/384.webp',true),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','ellie-hidden','Ellie','jogos','3990','The Last of Us','ellie-hidden/0123456789abcdef/384.webp',false);
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
update public.void_community_profiles set avatar_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' where user_id='11111111-1111-4111-8111-111111111111';
do $$begin
 if not exists(select 1 from public.void_community_profiles where user_id=auth.uid() and avatar_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and avatar_url='https://example.invalid/upload.webp') then raise exception 'Owner/photo failed'; end if;
 begin
  update public.void_community_profiles set avatar_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where user_id=auth.uid();
  raise exception 'Unpublished accepted';
 exception when check_violation then null; end;
 begin
  update public.void_community_profiles set avatar_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' where user_id=auth.uid();
  raise exception 'Invalid accepted';
 exception when check_violation or foreign_key_violation then null; end;
 begin
  update public.avatars set is_published=true;
  raise exception 'Catalog writable';
 exception when insufficient_privilege then null; end;
 begin
  insert into storage.objects values('kratos-one/0123456789abcdef/96.webp','avatars');
  raise exception 'Storage writable';
 exception when insufficient_privilege then null; end;
end$$;
update public.void_community_profiles set avatar_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' where user_id='22222222-2222-4222-8222-222222222222';
reset role;
do $$begin if exists(select 1 from public.void_community_profiles where user_id='22222222-2222-4222-8222-222222222222' and avatar_id is not null) then raise exception 'Cross-account write'; end if;end$$;
-- Identity lookup must work for a private profile without disclosing private fields.
update public.void_community_profiles set avatar_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' where user_id='22222222-2222-4222-8222-222222222222';
set local role anon;
do $$declare item jsonb;begin
 if (select count(*) from public.avatars)<>1 then raise exception 'Publication RLS'; end if;
 select to_jsonb(t) into item from public.void_avatar_identities(array['22222222-2222-4222-8222-222222222222']::uuid[]) t;
 if item->'avatar'->>'character_name'<>'Kratos' or item?'bio' or item?'avatar_url' or item?'visibility' then raise exception 'Identity projection'; end if;
 if exists(select 1 from public.void_avatar_identities(array_fill('11111111-1111-4111-8111-111111111111'::uuid,array[51]))) then raise exception 'Unbounded lookup'; end if;
end$$;
reset role;
update public.avatars set is_published=false where slug='kratos-one';
set local role anon;
do $$begin
 if exists(select 1 from public.avatars) then raise exception 'Unpublished visible'; end if;
 if exists(select 1 from public.void_avatar_identities(array['11111111-1111-4111-8111-111111111111']::uuid[]) where avatar is not null) then raise exception 'Unpublished resolved'; end if;
end$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
update public.void_community_profiles set display_name='Still editable',avatar_id=null where user_id=auth.uid();
do $$begin if not exists(select 1 from public.void_community_profiles where user_id=auth.uid() and avatar_id is null and avatar_url='https://example.invalid/upload.webp') then raise exception 'Photo restoration'; end if;end$$;
reset role;
set local role service_role;
update public.avatars set is_published=true where slug='kratos-one';
insert into storage.objects values('kratos-one/0123456789abcdef/96.webp','avatars');
reset role;
set local role authenticated;
update storage.objects set name='should-not-update.webp' where bucket_id='avatars';
delete from storage.objects where bucket_id='avatars';
reset role;
do $$begin if not exists(select 1 from storage.objects where name='kratos-one/0123456789abcdef/96.webp') then raise exception 'Storage update/delete bypass'; end if;end$$;
rollback;
