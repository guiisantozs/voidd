begin;
create or replace function void_private.username_signup() returns trigger language plpgsql security definer set search_path='' as $$
declare handle text:=new.raw_user_meta_data->>'username';label text;provider text:=new.raw_app_meta_data->>'provider';
begin
 label:=left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),'Pessoa do VOID'),50);
 -- Provider metadata may contain an unrelated/invalid username. OAuth must reach
 -- onboarding instead of failing authentication or claiming that value silently.
 if provider is not null and provider<>'email' then handle:=null;end if;
 if provider='email' and handle is null then raise exception 'USERNAME_REQUIRED';end if;
 if handle is not null and not public.void_username_valid(handle) then raise exception 'USERNAME_INVALID';end if;
 insert into public.void_community_profiles(user_id,display_name,username,visibility) values(new.id,label,handle,'private');
 return new;
end;$$;
create policy identity_limits_closed on void_private.identity_limits for all to anon,authenticated using(false) with check(false);
commit;
