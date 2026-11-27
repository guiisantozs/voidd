-- Execute após a migration, em ambiente de teste. Todos os dados desta verificação são revertidos.
begin;
insert into auth.users(id, email) values
('00000000-0000-4000-8000-000000000041', 'void-fixture-a@example.test'),
('00000000-0000-4000-8000-000000000042', 'void-fixture-b@example.test');

update public.void_community_profiles set username='test_'||substr(md5(user_id::text),1,12) where user_id in('00000000-0000-4000-8000-000000000041','00000000-0000-4000-8000-000000000042');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000041","role":"authenticated"}', true);
insert into public.void_profiles(user_id, display_name) values ('00000000-0000-4000-8000-000000000041', 'Teste A');
insert into public.void_records(user_id, kind, item_key, payload) values
('00000000-0000-4000-8000-000000000041', 'library', '42', '{"item":{"id":42,"categoria":"jogos","titulo":"Jogo"},"status":"want"}');
do $$ begin
  if (select count(*) from public.void_records where user_id='00000000-0000-4000-8000-000000000041') <> 1 then raise exception 'A não pode ler seus dados'; end if;
  begin
    insert into public.void_profiles(user_id, display_name) values ('00000000-0000-4000-8000-000000000042', 'Inválido');
    raise exception 'Inserção em outra conta foi aceita';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.void_records(user_id, kind, item_key, payload) values ('00000000-0000-4000-8000-000000000041', 'library', '43', '{}');
    raise exception 'Payload inválido foi aceito';
  exception when check_violation then null; end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000042","role":"authenticated"}', true);
do $$ declare affected integer; begin
  if exists(select 1 from public.void_records where user_id='00000000-0000-4000-8000-000000000041') or exists(select 1 from public.void_profiles where user_id='00000000-0000-4000-8000-000000000041') then raise exception 'B pode ler dados de A'; end if;
  update public.void_records set payload = null where user_id='00000000-0000-4000-8000-000000000041' and item_key = '42';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'B pode modificar dados de A'; end if;
end $$;

reset role;
set local role anon;
do $$ begin
  if exists(select 1 from public.void_records where user_id in ('00000000-0000-4000-8000-000000000041','00000000-0000-4000-8000-000000000042')) then raise exception 'Visitante recebeu acesso aos dados privados'; end if;
  begin perform 1 from public.void_profiles; raise exception 'Visitante recebeu acesso ao perfil privado'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
