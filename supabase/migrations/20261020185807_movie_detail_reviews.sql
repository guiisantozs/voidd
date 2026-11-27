begin;

-- Interactions reference the existing review, never a second copy of its content.
create table public.void_review_likes (
 user_id uuid not null references auth.users(id) on delete cascade,
 review_user uuid not null,
 item_key text not null check(item_key ~ '^filmes:[1-9][0-9]*$'),
 review_kind text not null default 'review' check(review_kind='review'),
 created_at timestamptz not null default now(),
 primary key(user_id,review_user,item_key),
 foreign key(review_user,review_kind,item_key) references public.void_records(user_id,kind,item_key) on delete cascade
);
create index void_likes_review on public.void_review_likes(review_user,item_key);
create table public.void_review_comments (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 review_user uuid not null,
 item_key text not null check(item_key ~ '^filmes:[1-9][0-9]*$'),
 review_kind text not null default 'review' check(review_kind='review'),
 body text not null check(length(trim(body)) between 1 and 1000),
 created_at timestamptz not null default now(),
 foreign key(review_user,review_kind,item_key) references public.void_records(user_id,kind,item_key) on delete cascade
);
create index void_comments_review on public.void_review_comments(review_user,item_key,created_at,id);
create index void_comments_owner on public.void_review_comments(user_id);
create table public.void_review_reports (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 review_user uuid not null,
 item_key text not null check(item_key ~ '^filmes:[1-9][0-9]*$'),
 review_kind text not null default 'review' check(review_kind='review'),
 comment_id uuid references public.void_review_comments(id) on delete cascade,
 reason text not null check(length(trim(reason)) between 3 and 500),
 created_at timestamptz not null default now(),
 foreign key(review_user,review_kind,item_key) references public.void_records(user_id,kind,item_key) on delete cascade
);
create unique index void_reports_once on public.void_review_reports(user_id,review_user,item_key,coalesce(comment_id,'00000000-0000-0000-0000-000000000000'::uuid));
create index void_reports_review on public.void_review_reports(review_user,review_kind,item_key);
create index void_reports_comment on public.void_review_reports(comment_id);
create index void_movie_public_lookup on public.void_records(item_key,updated_at desc,user_id) where is_public;
create index void_friends_sender_status on public.void_friendships(sender,status);

alter table public.void_review_likes enable row level security;
alter table public.void_review_comments enable row level security;
alter table public.void_review_reports enable row level security;
revoke all on public.void_review_likes,public.void_review_comments,public.void_review_reports from anon,authenticated;
grant select on public.void_review_likes,public.void_review_comments to anon,authenticated;
grant insert(user_id,review_user,item_key),delete on public.void_review_likes to authenticated;
grant insert(user_id,review_user,item_key,body),delete on public.void_review_comments to authenticated;
grant select on public.void_review_reports to authenticated;
grant insert(user_id,review_user,item_key,comment_id,reason) on public.void_review_reports to authenticated;

create policy likes_public on public.void_review_likes for select to anon,authenticated using(exists(select 1 from public.void_records r where r.user_id=review_user and r.item_key=void_review_likes.item_key and r.kind='review' and r.is_public));
create policy likes_own_insert on public.void_review_likes for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.void_records r where r.user_id=review_user and r.item_key=void_review_likes.item_key and r.kind='review' and r.is_public));
create policy likes_own_delete on public.void_review_likes for delete to authenticated using(user_id=(select auth.uid()));
create policy comments_public on public.void_review_comments for select to anon,authenticated using(exists(select 1 from public.void_records r where r.user_id=review_user and r.item_key=void_review_comments.item_key and r.kind='review' and r.is_public));
create policy comments_own_insert on public.void_review_comments for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.void_records r where r.user_id=review_user and r.item_key=void_review_comments.item_key and r.kind='review' and r.is_public));
create policy comments_own_delete on public.void_review_comments for delete to authenticated using(user_id=(select auth.uid()));
-- Reports are only visible to their reporter and database administrators.
create policy reports_own_read on public.void_review_reports for select to authenticated using(user_id=(select auth.uid()));
create policy reports_own_insert on public.void_review_reports for insert to authenticated with check(user_id=(select auth.uid())
 and exists(select 1 from public.void_records r where r.user_id=review_user and r.item_key=void_review_reports.item_key and r.kind='review' and r.is_public)
 and (comment_id is null or exists(select 1 from public.void_review_comments c where c.id=comment_id and c.review_user=void_review_reports.review_user and c.item_key=void_review_reports.item_key)));

-- Atomic per-account/minute limits, enforced even when bypassing the website.
create schema if not exists void_private;
revoke all on schema void_private from public,anon,authenticated;
create table void_private.write_limits(user_id uuid not null references auth.users(id) on delete cascade,action text not null,bucket timestamptz not null,n integer not null,primary key(user_id,action));
alter table void_private.write_limits enable row level security;
revoke all on void_private.write_limits from public,anon,authenticated;
create function void_private.review_write_limit() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); max_writes integer; used integer;
begin
 if actor is null then return new; end if;
 if tg_table_name='void_records' then
   if new.kind<>'review' or new.payload is null then return new; end if;
   if tg_op='UPDATE' and new.payload is not distinct from old.payload then return new; end if;
 end if;
 max_writes:=case tg_table_name when 'void_review_likes' then 60 when 'void_review_reports' then 5 else 10 end;
 insert into void_private.write_limits as w values(actor,tg_table_name,date_trunc('minute',clock_timestamp()),1)
 on conflict(user_id,action) do update set bucket=excluded.bucket,n=case when w.bucket=excluded.bucket then w.n+1 else 1 end returning n into used;
 if used>max_writes then raise exception 'Limite de envios por minuto. Aguarde e tente novamente.' using errcode='P0001'; end if;
 return new;
end;$$;
revoke all on function void_private.review_write_limit() from public,anon,authenticated;
create trigger review_rate before insert or update on public.void_records for each row execute function void_private.review_write_limit();
create trigger like_rate before insert on public.void_review_likes for each row execute function void_private.review_write_limit();
create trigger comment_rate before insert on public.void_review_comments for each row execute function void_private.review_write_limit();
create trigger report_rate before insert on public.void_review_reports for each row execute function void_private.review_write_limit();

create function public.void_detail_friend_ids() returns uuid[] language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null then return '{}'::uuid[]; end if;
 return array(select case when sender=auth.uid() then recipient else sender end from public.void_friendships where status='accepted' and auth.uid() in(sender,recipient));
end;$$;

create function public.void_movie_review_summary(movie_key text) returns jsonb language sql stable security invoker set search_path='' as $$
with reviews as(select r.user_id,(r.payload->>'nota')::numeric*2 rating from public.void_records r where r.item_key=movie_key and r.kind='review' and r.is_public),
friends as(select * from reviews where user_id=any(public.void_detail_friend_ids())),
hist as(select n,count(r.rating) total from generate_series(0,10) n left join reviews r on round(r.rating)=n group by n)
select jsonb_build_object('average',(select avg(rating) from reviews),'total',(select count(*) from reviews),
'histogram',(select jsonb_agg(jsonb_build_object('rating',n,'total',total) order by n) from hist),
'friendCount',(select count(*) from friends),'friendAverage',(select avg(rating) from friends),
'friends',coalesce((select jsonb_agg(jsonb_build_object('user_id',f.user_id,'rating',f.rating,'display_name',coalesce(p.display_name,'Pessoa do VOID'))) from friends f left join public.void_community_profiles p using(user_id)),'[]'::jsonb));
$$;

-- Threshold is in the 0..10 display scale; override the argument to tune it.
create function public.void_movie_review_page(movie_key text,sort_by text default 'recent',min_rating numeric default 0,max_rating numeric default 10,page_offset integer default 0,friends_only boolean default false,unpopular_threshold numeric default 3) returns jsonb language sql stable security invoker set search_path='' as $$
with reviews as (
 select r.user_id,r.item_key,r.payload,r.updated_at,coalesce(p.display_name,'Pessoa do VOID') display_name,
 (r.payload->>'nota')::numeric*2 rating,r.user_id=any(public.void_detail_friend_ids()) is_friend
 from public.void_records r left join public.void_community_profiles p using(user_id) where r.item_key=movie_key and r.kind='review' and r.is_public
), rated as (
 select r.*, (select count(*) from public.void_review_likes l where l.item_key=movie_key and l.review_user=r.user_id) likes,
 exists(select 1 from public.void_review_likes l where l.item_key=movie_key and l.review_user=r.user_id and l.user_id=(select auth.uid())) liked,
 (select count(*) from public.void_review_comments c where c.item_key=movie_key and c.review_user=r.user_id) comments
 from reviews r where r.rating between min_rating and max_rating and (not friends_only or is_friend)
), paged as (
 select * from rated order by case when sort_by='friends' then is_friend::integer else 0 end desc,
 case when sort_by='likes' then likes else 0 end desc,updated_at desc,user_id limit 20 offset greatest(0,least(page_offset,100000))
)
select jsonb_build_object('total',(select count(*) from rated),'reviews',coalesce((select jsonb_agg(jsonb_build_object(
'user_id',user_id,'display_name',display_name,'rating',rating,'text',coalesce(payload->>'texto',''),'spoiler',coalesce(payload->>'spoiler','false')='true',
'updated_at',updated_at,'watched_at',payload->>'data','rewatched',coalesce(payload->>'revi','false')='true','is_friend',is_friend,'likes',likes,'liked',liked,'comments',comments,
'unpopular',(select count(*) from reviews)>=5 and abs(rating-(select avg(rating) from reviews))>=greatest(1,unpopular_threshold))) from paged),'[]'::jsonb));
$$;

create function public.void_movie_review_comments(movie_key text,author_id uuid,page_offset integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object('total',(select count(*) from public.void_review_comments where item_key=movie_key and review_user=author_id),
'comments',coalesce((select jsonb_agg(to_jsonb(t)) from(select c.id,c.user_id,c.body,c.created_at,coalesce(p.display_name,'Pessoa do VOID') display_name
from public.void_review_comments c left join public.void_community_profiles p using(user_id) where item_key=movie_key and review_user=author_id order by c.created_at,c.id limit 20 offset greatest(0,least(page_offset,100000))) t),'[]'::jsonb));
$$;
revoke all on function public.void_detail_friend_ids(),public.void_movie_review_summary(text),public.void_movie_review_page(text,text,numeric,numeric,integer,boolean,numeric),public.void_movie_review_comments(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.void_detail_friend_ids(),public.void_movie_review_summary(text),public.void_movie_review_page(text,text,numeric,numeric,integer,boolean,numeric),public.void_movie_review_comments(text,uuid,integer) to anon,authenticated;
commit;
