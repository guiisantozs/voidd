begin;

-- Auth auto-confirmation grants access; this table records actual mailbox proof.
create table public.void_email_verifications (
 user_id uuid primary key references auth.users(id) on delete cascade,
 verified_email text,
 verified_at timestamptz,
 last_sent_at timestamptz,
 check ((verified_email is null) = (verified_at is null))
);
alter table public.void_email_verifications enable row level security;
revoke all on public.void_email_verifications from public,anon,authenticated;
grant select on public.void_email_verifications to authenticated;
grant all on public.void_email_verifications to service_role;
create policy email_verification_owner on public.void_email_verifications
for select to authenticated using (user_id=(select auth.uid()));

-- No backfill from email_confirmed_at: it may already represent auto-confirmation.
-- Only the Edge Function can record proof, after Auth verifies an email token.
create function public.void_email_verification_claim(target uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare claimed uuid;
begin
 insert into public.void_email_verifications(user_id,last_sent_at) values(target,now())
 on conflict(user_id) do update set last_sent_at=now()
 where void_email_verifications.last_sent_at is null
 or void_email_verifications.last_sent_at <= now()-interval '60 seconds'
 returning user_id into claimed;
 return claimed is not null;
end;$$;
revoke all on function public.void_email_verification_claim(uuid) from public,anon,authenticated;
grant execute on function public.void_email_verification_claim(uuid) to service_role;

-- Existing pending accounts still fail native password login after flipping the
-- auto-confirm setting. Lookup is available only to our privileged function,
-- AFTER the Auth password endpoint has validated the supplied password.
create function void_private.pending_email_account(address text) returns uuid
language sql stable security definer set search_path='' as $$
 select id from auth.users where lower(email)=lower(trim(address))
 and email_confirmed_at is null and encrypted_password is not null limit 1;
$$;
revoke all on function void_private.pending_email_account(text) from public,anon,authenticated;
grant usage on schema void_private to service_role;
grant execute on function void_private.pending_email_account(text) to service_role;
create function public.void_pending_email_account(address text) returns uuid
language sql stable security invoker set search_path='' as $$
 select void_private.pending_email_account(address);
$$;
revoke all on function public.void_pending_email_account(text) from public,anon,authenticated;
grant execute on function public.void_pending_email_account(text) to service_role;

commit;
