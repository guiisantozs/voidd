begin;

create table public.avatars (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug)<=120),
 character_name text not null check (length(trim(character_name)) between 1 and 100),
 media_type text not null check (media_type in ('filmes','series','jogos','animes','livros')),
 media_id text not null check (media_id ~ '^[1-9][0-9]{0,9}$'),
 media_title text not null check (length(trim(media_title)) between 1 and 200),
 image_path text not null check (image_path ~ '^[a-z0-9-]+/[a-f0-9]{16}/384[.]webp$'),
 bg_color text check (bg_color ~ '^#[0-9A-Fa-f]{6}$'),
 sort_order integer not null default 0,
 is_published boolean not null default true,
 unlock_rule jsonb,
 created_at timestamptz not null default now()
);
create index avatars_published_work on public.avatars(media_type,media_id,sort_order,slug) where is_published;
alter table public.avatars enable row level security;
revoke all on public.avatars from public,anon,authenticated;
grant select on public.avatars to anon,authenticated;
grant all on public.avatars to service_role;
create policy avatars_published_read on public.avatars for select to anon,authenticated using (is_published);

alter table public.void_community_profiles add column avatar_id uuid references public.avatars(id) on delete set null;
create index community_profiles_avatar_id on public.void_community_profiles(avatar_id) where avatar_id is not null;
grant insert(avatar_id),update(avatar_id) on public.void_community_profiles to authenticated;
-- Existing owner INSERT/UPDATE policies remain authoritative. Validate the
-- selected catalog row independently; no existing photo or identity is rewritten.
create function void_private.published_avatar_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and new.avatar_id is not distinct from old.avatar_id then return new; end if;
 if new.avatar_id is not null and not exists(select 1 from public.avatars a where a.id=new.avatar_id and a.is_published) then
  raise exception 'AVATAR_UNAVAILABLE' using errcode='23514';
 end if;
 return new;
end;$$;
revoke all on function void_private.published_avatar_guard() from public,anon,authenticated;
create trigger published_avatar_guard before insert or update of avatar_id on public.void_community_profiles for each row execute function void_private.published_avatar_guard();

-- Same already-public minimal identity boundary as void_private.identities.
-- This projection includes only a published character avatar, never profile
-- bio, visibility, uploaded photo, private library or other account data.
create function void_private.avatar_identities(ids uuid[]) returns table(user_id uuid,avatar_id uuid,avatar jsonb)
language sql stable security definer set search_path='' as $$
 select p.user_id,a.id,
  case when a.id is not null then jsonb_build_object('id',a.id,'slug',a.slug,'character_name',a.character_name,'media_type',a.media_type,'media_id',a.media_id,'media_title',a.media_title,'image_path',a.image_path,'bg_color',a.bg_color,'is_published',a.is_published) end
 from public.void_community_profiles p left join public.avatars a on a.id=p.avatar_id and a.is_published
 where cardinality(ids) between 1 and 50 and p.user_id=any(ids);
$$;
create function public.void_avatar_identities(ids uuid[]) returns table(user_id uuid,avatar_id uuid,avatar jsonb)
language sql stable security invoker set search_path='' as $$select * from void_private.avatar_identities(ids);$$;
revoke all on function void_private.avatar_identities(uuid[]),public.void_avatar_identities(uuid[]) from public;
grant execute on function void_private.avatar_identities(uuid[]),public.void_avatar_identities(uuid[]) to anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('avatars','avatars',true,1048576,array['image/webp']);
create policy character_avatars_read on storage.objects for select to anon,authenticated using(bucket_id='avatars');
-- Restrictive policies prevent another broad bucket policy from granting writes.
create policy character_avatars_no_insert on storage.objects as restrictive for insert to anon,authenticated with check(bucket_id<>'avatars');
create policy character_avatars_no_update on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'avatars') with check(bucket_id<>'avatars');
create policy character_avatars_no_delete on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>'avatars');

commit;
