-- Development only. Fixtures and all mutations roll back.
begin;
create temp table email_test_ids as select gen_random_uuid() a,gen_random_uuid() b;
grant select on email_test_ids to authenticated,service_role;
insert into auth.users(id) select a from email_test_ids union all select b from email_test_ids;
set local role service_role;
do $$begin
 if not public.void_email_verification_claim((select a from email_test_ids)) then raise exception 'First request rejected';end if;
 if public.void_email_verification_claim((select a from email_test_ids)) then raise exception 'Cooldown bypassed';end if;
 if not public.void_email_verification_claim((select b from email_test_ids)) then raise exception 'Accounts share a cooldown';end if;
end$$;
update public.void_email_verifications set verified_email='owner@example.test',verified_at=now() where user_id=(select a from email_test_ids);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select a::text from email_test_ids),true);
do $$begin
 if (select count(*) from public.void_email_verifications)<>1 then raise exception 'Verification rows leaked across users';end if;
 begin update public.void_email_verifications set verified_email='forged@example.test';raise exception 'Client forged proof';exception when insufficient_privilege then null;end;
 begin perform public.void_email_verification_claim(auth.uid());raise exception 'Client bypassed server request';exception when insufficient_privilege then null;end;
 begin perform public.void_pending_email_account('owner@example.test');raise exception 'Client accessed legacy lookup';exception when insufficient_privilege then null;end;
end$$;
reset role;
rollback;
