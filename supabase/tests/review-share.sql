-- Development only: synthetic accounts and persistent limiter checks.
begin;
do $$begin if (select prosecdef from pg_proc where oid='public.void_review_share_budget()'::regprocedure) then raise exception 'Exposed limiter unexpectedly privileged';end if;end;$$;
create temp table share_ids as select gen_random_uuid() a,gen_random_uuid() b,gen_random_uuid() c;
grant select on share_ids to authenticated;
insert into auth.users(id) select a from share_ids union all select b from share_ids union all select c from share_ids;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select a::text from share_ids),true);
do $$begin
 for i in 1..40 loop perform public.void_review_share_budget();end loop;
 begin perform public.void_review_share_budget();raise exception 'Budget bypassed';exception when raise_exception then if sqlerrm<>'RATE_LIMIT' then raise;end if;end;
 begin perform count(*) from void_private.identity_limits;raise exception 'Limiter table exposed';exception when insufficient_privilege then null;end;
end;$$;
select set_config('request.jwt.claim.sub',(select b::text from share_ids),true);
select public.void_review_share_budget();
select set_config('request.jwt.claim.sub',(select c::text from share_ids),true);
select public.void_review_share_budget();
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$begin
 for i in 1..120 loop perform public.void_review_share_budget();end loop;
 begin perform public.void_review_share_budget();raise exception 'Anonymous budget bypassed';exception when raise_exception then if sqlerrm<>'RATE_LIMIT' then raise;end if;end;
end;$$;
rollback;
