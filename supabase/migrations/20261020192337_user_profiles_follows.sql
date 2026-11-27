begin;

-- Extend the existing public identity; private account profiles remain private.
alter table public.void_community_profiles
 add column username text unique,
 add column bio text not null default '' check(length(bio)<=240),
 add column avatar_url text not null default '' check(length(avatar_url)<=1000 and (avatar_url='' or avatar_url ~ '^https://[^[:space:]"<>\\]+$')),
 add column banner_url text not null default '' check(length(banner_url)<=1000 and (banner_url='' or banner_url ~ '^https://[^[:space:]"<>\\]+$')),
 add column visibility text not null default 'public' check(visibility in('public','followers','private')),
 add column joined_at timestamptz not null default now();
update public.void_community_profiles p set username='void_'||replace(p.user_id::text,'-',''),joined_at=coalesce(u.created_at,now()) from auth.users u where u.id=p.user_id;
alter table public.void_community_profiles alter column username set not null;
alter table public.void_community_profiles add constraint profile_username_shape check(username ~ '^[a-z0-9_]{3,40}$');
revoke insert,update on public.void_community_profiles from authenticated;
grant insert(user_id,display_name,username,bio,avatar_url,banner_url,visibility),update(user_id,display_name,username,bio,avatar_url,banner_url,visibility) on public.void_community_profiles to authenticated;

create function void_private.profile_defaults() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.username is null then new.username:='void_'||replace(new.user_id::text,'-',''); end if;
 select coalesce(created_at,now()) into new.joined_at from auth.users where id=new.user_id;
 return new;
end;$$;
revoke all on function void_private.profile_defaults() from public,anon,authenticated;
create trigger community_profile_defaults before insert on public.void_community_profiles for each row execute function void_private.profile_defaults();

create table public.follows(
 follower_id uuid not null references auth.users(id) on delete cascade,
 followed_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(follower_id,followed_id),check(follower_id<>followed_id)
);
create index follows_followed_recent on public.follows(followed_id,created_at desc,follower_id);
create index follows_follower_recent on public.follows(follower_id,created_at desc,followed_id);
alter table public.follows enable row level security;
revoke all on public.follows from anon,authenticated;
grant select on public.follows to anon,authenticated;
grant insert(follower_id,followed_id),delete on public.follows to authenticated;
create policy follows_read on public.follows for select to anon,authenticated using(true);
create policy follows_create on public.follows for insert to authenticated with check(follower_id=(select auth.uid()));
create policy follows_remove on public.follows for delete to authenticated using(follower_id=(select auth.uid()));

-- A single private boolean lookup avoids recursive RLS on the public identity.
-- Caller identity always comes from auth.uid(), never a caller-supplied viewer ID.
create function void_private.can_view_profile(target uuid) returns boolean language sql stable security definer set search_path='' as $$
select target=(select auth.uid()) or coalesce((select visibility='public' or (visibility='followers' and exists(select 1 from public.follows where follower_id=(select auth.uid()) and followed_id=target)) from public.void_community_profiles where user_id=target),false);
$$;
revoke all on function void_private.can_view_profile(uuid) from public,anon,authenticated;
grant usage on schema void_private to anon,authenticated;
grant execute on function void_private.can_view_profile(uuid) to anon,authenticated;
drop policy public_identity on public.void_community_profiles;
create policy public_identity on public.void_community_profiles for select to anon,authenticated using(void_private.can_view_profile(user_id));
drop policy records_read on public.void_records;
drop policy records_public on public.void_records;
create policy records_read on public.void_records for select to authenticated using(user_id=(select auth.uid()) or (is_public and void_private.can_view_profile(user_id)));
create policy records_public on public.void_records for select to anon using(is_public and void_private.can_view_profile(user_id));

create table public.profile_favorites(
 user_id uuid not null references auth.users(id) on delete cascade,
 media_type text not null check(media_type in('filmes','series','jogos','animes')),
 slot integer not null check(slot between 1 and 4),
 external_id bigint not null check(external_id>0),
 item jsonb not null,
 primary key(user_id,media_type,slot),unique(user_id,media_type,external_id),
 constraint favorite_item_shape check((jsonb_typeof(item)='object' and jsonb_typeof(item->'titulo')='string' and length(item->>'titulo') between 1 and 300 and item->>'id'=external_id::text and item->>'categoria'=media_type and octet_length(item::text)<=6000) is true)
);
alter table public.profile_favorites enable row level security;
revoke all on public.profile_favorites from anon,authenticated;
grant select on public.profile_favorites to anon,authenticated;
grant insert(user_id,media_type,slot,external_id,item),delete on public.profile_favorites to authenticated;
create policy favorites_read on public.profile_favorites for select to anon,authenticated using(user_id=(select auth.uid()) or void_private.can_view_profile(user_id));
create policy favorites_create on public.profile_favorites for insert to authenticated with check(user_id=(select auth.uid()));
create policy favorites_remove on public.profile_favorites for delete to authenticated using(user_id=(select auth.uid()));
create index profile_review_recent on public.void_records(user_id,updated_at desc,item_key) where kind='review' and payload is not null;

create function public.void_profile_friend_ids(target uuid) returns uuid[] language plpgsql stable security invoker set search_path='' as $$
declare ids uuid[];
begin
 ids:=array(select a.followed_id from public.follows a join public.follows b on b.follower_id=a.followed_id and b.followed_id=a.follower_id where a.follower_id=target);
 -- Existing invitations retain their original participant-only privacy.
 if auth.uid() is not null then
  ids:=array(select distinct id from(select unnest(ids) id union all select case when sender=target then recipient else sender end from public.void_friendships where status='accepted' and target in(sender,recipient) and auth.uid() in(sender,recipient)) t);
 end if;
 return ids;
end;$$;
create or replace function public.void_detail_friend_ids() returns uuid[] language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null then return '{}'::uuid[];end if;
 return public.void_profile_friend_ids(auth.uid());
end;$$;
create or replace function public.void_friend_movies() returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object('friendCount',cardinality(public.void_detail_friend_ids()),'movies',coalesce((select jsonb_agg(to_jsonb(t) order by t.updated_at desc) from(
 select * from(select distinct on(r.item_key) r.movie,r.rating,r.user_id,r.display_name,r.updated_at from public.void_movie_reviews r where r.user_id=any(public.void_detail_friend_ids()) order by r.item_key,r.updated_at desc,r.user_id) recent order by updated_at desc limit 20
) t),'[]'::jsonb));
$$;

create function public.void_profile_overview(target uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare p jsonb; result jsonb; own boolean:=coalesce(target=auth.uid(),false); following boolean;
begin
 following:=exists(select 1 from public.follows where follower_id=auth.uid() and followed_id=target);
 if not coalesce(void_private.can_view_profile(target),false) then return jsonb_build_object('locked',true,'following',following);end if;
 select to_jsonb(c) into p from public.void_community_profiles c where user_id=target;
 if p is null and not own then return jsonb_build_object('notFound',true);end if;
 if p is null then
  select jsonb_build_object('user_id',target,'display_name',display_name,'bio',bio,'visibility','private','username','void_'||replace(target::text,'-','')) into p from public.void_profiles where user_id=target;
  p:=coalesce(p,jsonb_build_object('user_id',target,'display_name','Seu perfil','bio','','visibility','private','username','void_'||replace(target::text,'-','')));
 end if;
 with records as materialized(select item_key,payload,updated_at,(payload->>'nota')::numeric rating from public.void_records where user_id=target and kind='review' and payload is not null),
 media as(select split_part(item_key,':',1) media,count(*) total from records group by 1),
 hist as(select n,count(r.rating) total from generate_series(0,10) n left join records r on round(r.rating*2)=n group by n),
 genres as(select g.genre,count(*) total from records r cross join lateral jsonb_array_elements_text(case when jsonb_typeof(r.payload->'item'->'generos')='array' then r.payload->'item'->'generos' else '[]'::jsonb end) g(genre) group by g.genre order by count(*) desc,g.genre limit 5)
 select jsonb_build_object('profile',p,'is_owner',own,'following',following,'is_friend',target=any(public.void_detail_friend_ids()),
 'counts',jsonb_build_object('reviews',(select count(*) from records),'followers',(select count(*) from public.follows where followed_id=target),'following',(select count(*) from public.follows where follower_id=target),'friends',cardinality(public.void_profile_friend_ids(target))),
 'media',coalesce((select jsonb_agg(to_jsonb(media)) from media),'[]'::jsonb),'histogram',(select jsonb_agg(to_jsonb(hist) order by n) from hist),'genres',coalesce((select jsonb_agg(to_jsonb(genres)) from genres),'[]'::jsonb),
 'recent',coalesce((select jsonb_agg(to_jsonb(t)) from(select item_key,payload,updated_at from records order by updated_at desc,item_key limit 8) t),'[]'::jsonb),
 'favorites',coalesce((select jsonb_agg(to_jsonb(f) order by media_type,slot) from public.profile_favorites f where user_id=target),'[]'::jsonb)) into result;
 return result;
end;$$;

create function public.void_profile_reviews(target uuid,media text default 'all',min_rating numeric default 0,max_rating numeric default 10,sort_by text default 'recent',page_offset integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$
with rows as materialized(select item_key,payload,updated_at,(payload->>'nota')::numeric rating from public.void_records where user_id=target and kind='review' and payload is not null and void_private.can_view_profile(target)
 and (media='all' or split_part(item_key,':',1)=media) and (payload->>'nota')::numeric*2 between min_rating and max_rating),
paged as(select item_key,payload,updated_at from rows order by case when sort_by='rating' then rating end desc nulls last,updated_at desc,item_key limit 20 offset greatest(0,least(page_offset,100000)))
select jsonb_build_object('total',(select count(*) from rows),'reviews',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb));
$$;

create function public.void_profile_connections(target uuid,list_type text default 'followers',page_offset integer default 0) returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if not coalesce(void_private.can_view_profile(target),false) then return jsonb_build_object('total',0,'people','[]'::jsonb);end if;
 return(with ids as (
 select follower_id id from public.follows where list_type='followers' and followed_id=target
 union select followed_id from public.follows where list_type='following' and follower_id=target
 union select unnest(public.void_profile_friend_ids(target)) where list_type='friends'
 ), paged as(select id from ids order by id limit 30 offset greatest(0,least(page_offset,100000)))
 select jsonb_build_object('total',(select count(*) from ids),'people',coalesce((select jsonb_agg(jsonb_build_object('user_id',id,'display_name',coalesce(p.display_name,'Perfil reservado'),'username',p.username,'avatar_url',p.avatar_url,
 'following',exists(select 1 from public.follows where follower_id=auth.uid() and followed_id=id),
 'mutual',exists(select 1 from public.follows a join public.follows b on b.follower_id=a.followed_id and b.followed_id=a.follower_id where a.follower_id=target and a.followed_id=id))) from paged left join public.void_community_profiles p on p.user_id=id),'[]'::jsonb)));
end;$$;

create function public.void_profile_set_favorites(media text,entries jsonb) returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 if media not in('filmes','series','jogos','animes') or jsonb_typeof(entries)<>'array' or jsonb_array_length(entries)>4 then raise exception 'Invalid favorites';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||media,0));
 delete from public.profile_favorites where user_id=auth.uid() and media_type=media;
 insert into public.profile_favorites(user_id,media_type,slot,external_id,item)
 select auth.uid(),media,ordinality::integer,(value->>'id')::bigint,value from jsonb_array_elements(entries) with ordinality;
end;$$;

revoke all on function public.void_profile_friend_ids(uuid),public.void_profile_overview(uuid),public.void_profile_reviews(uuid,text,numeric,numeric,text,integer),public.void_profile_connections(uuid,text,integer),public.void_profile_set_favorites(text,jsonb) from public,anon,authenticated;
grant execute on function public.void_profile_friend_ids(uuid),public.void_profile_overview(uuid),public.void_profile_reviews(uuid,text,numeric,numeric,text,integer),public.void_profile_connections(uuid,text,integer) to anon,authenticated;
grant execute on function public.void_profile_set_favorites(text,jsonb) to authenticated;
commit;
