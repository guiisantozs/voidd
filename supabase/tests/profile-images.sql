-- Run against a project with all migrations applied. Fixtures are rolled back.
begin;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000001','void-storage-test-a@example.invalid'),
 ('00000000-0000-4000-8000-000000000002','void-storage-test-b@example.invalid');
insert into public.void_community_profiles(user_id,display_name,visibility,avatar_url)
 values('00000000-0000-4000-8000-000000000001','Storage test','public',
 'https://example.supabase.co/storage/v1/object/public/profile-avatars/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000003.webp') on conflict(user_id) do update set avatar_url=excluded.avatar_url,visibility=excluded.visibility;
update public.void_community_profiles set username='test_'||substr(md5(user_id::text),1,12) where user_id in('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into storage.objects(bucket_id,name) values('profile-avatars','00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000003.webp');
-- Alternate browser encoder formats retain the same owner restriction.
insert into storage.objects(bucket_id,name) values
 ('profile-avatars','00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000005.jpg'),
 ('profile-avatars','00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000006.png');
do $$begin
 begin
  insert into storage.objects(bucket_id,name) values('profile-avatars','00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000007.svg');
  raise exception 'Unsupported avatar extension allowed';
 exception when insufficient_privilege then null;end;
end$$;
do $$begin
 begin
  insert into storage.objects(bucket_id,name) values('profile-avatars','00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000004.webp');
  raise exception 'Cross-user upload allowed';
 exception when insufficient_privilege then null;end;
end$$;
set local role anon;
set local request.jwt.claims='{}';
do $$begin if not exists(select 1 from storage.objects where bucket_id='profile-avatars' and name='00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000003.webp') then raise exception 'Public avatar unreadable';end if;end$$;
set local role postgres;
update public.void_community_profiles set visibility='private' where user_id='00000000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
do $$begin if not exists(select 1 from storage.objects where bucket_id='profile-avatars' and name='00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000003.webp') then raise exception 'Public identity avatar unreadable';end if;end$$;
set local role postgres;
update public.void_community_profiles set visibility='followers' where user_id='00000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$begin if not exists(select 1 from storage.objects where bucket_id='profile-avatars' and name='00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000003.webp') then raise exception 'Public identity avatar unreadable';end if;end$$;
insert into public.follows(follower_id,followed_id) values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001');
do $$begin if not exists(select 1 from storage.objects where bucket_id='profile-avatars' and name='00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000003.webp') then raise exception 'Follower avatar unreadable';end if;end$$;
rollback;
