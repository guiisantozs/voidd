begin;
do $$begin
 if void_private.people_resolve('blockedhandletest') is not null then raise exception 'Prohibited alias still resolves';end if;
 if exists(select 1 from public.void_community_profiles where username='blockedhandletest') then raise exception 'Handle still public';end if;
 if not exists(select 1 from public.void_community_profiles where user_id='00000000-0000-4000-8000-000000000004' and username is null and visibility='private') then raise exception 'Moderation not applied';end if;
 if not exists(select 1 from public.username_history where user_id='00000000-0000-4000-8000-000000000004' and username='blockedhandletest') then raise exception 'Reversible history missing';end if;
end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
do $$begin
 if not (public.void_username_self()->>'username_required')::boolean then raise exception 'Correction not required';end if;
 if public.void_name_check('blockedhandletest') then raise exception 'Prohibited name can be reused';end if;
 perform public.void_profile_name_correct('novo_usuario_teste','Pessoa teste');
 if (public.void_username_self()->>'username_required')::boolean then raise exception 'Correction not accepted';end if;
 begin update public.void_community_profiles set username=null where user_id=auth.uid();raise exception 'User cleared own handle';exception when check_violation then null;end;
end$$;
reset role;
do $$begin
 if not exists(select 1 from void_private.profile_name_flags where user_id='00000000-0000-4000-8000-000000000004' and resolved_at is not null) then raise exception 'Flag not resolved';end if;
end$$;
rollback;
