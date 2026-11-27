begin;
-- Browsers may fall back to PNG/JPEG when WebP encoding is unavailable.
-- The bucket remains private and the stored file limit stays at 1 MiB.
update storage.buckets set allowed_mime_types=array['image/webp','image/jpeg','image/png']
where id='profile-avatars';

drop policy void_avatar_insert on storage.objects;
create policy void_avatar_insert on storage.objects for insert to authenticated
with check(bucket_id='profile-avatars'
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.](webp|jpg|png)$');
-- No changes to visibility, deletion, ownership or public identity rules.
commit;
