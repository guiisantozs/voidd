begin;
create or replace function void_private.people_search(term text) returns jsonb language plpgsql security definer set search_path='' as $$
declare q text:=lower(ltrim(trim(term),'@'));result jsonb;
begin
 perform void_private.identity_limit('people');
 if length(q)<2 or length(q)>20 or q !~ '^[a-z0-9][a-z0-9._]*$' or q ~ '[._]{2}' then return '[]'::jsonb;end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.exact desc,t.username),'[]'::jsonb) into result from (
  select p.user_id,p.display_name,p.username,p.avatar_url,p.username=q exact,
   exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followed_id=p.user_id) following
  from public.void_community_profiles p
  where p.username like replace(q,'_',chr(92)||'_')||'%'
  order by (p.username=q) desc,p.username limit 10
 )t;return result;
end;$$;
commit;
