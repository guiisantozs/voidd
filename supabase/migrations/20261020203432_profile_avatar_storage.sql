begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-avatars','profile-avatars',false,1048576,array['image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Unique filenames avoid overwrites and stale images. No UPDATE/upsert permission needed.
create policy void_avatar_insert on storage.objects for insert to authenticated
with check(bucket_id='profile-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text
 and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$');
create policy void_avatar_delete on storage.objects for delete to authenticated
using(bucket_id='profile-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- Identity rows already enforce public/followers/private RLS. Visitors may only read
-- the image currently attached to a visible profile, never arbitrary old uploads.
create policy void_avatar_read on storage.objects for select to anon,authenticated
using(bucket_id='profile-avatars' and (
 (storage.foldername(name))[1]=(select auth.uid())::text
 or exists(select 1 from public.void_community_profiles p
   where p.user_id::text=(storage.foldername(name))[1]
   and right(p.avatar_url,length(name)+1)='/'||name)
));

commit;
