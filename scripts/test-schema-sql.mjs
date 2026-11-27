// Complete local migration replay against an empty, disposable PostgreSQL WASM
// instance. Auth/Storage mocks model the interfaces, not the hosted services.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

if (!process.argv[2]) throw Error('Informe o caminho do módulo PGlite temporário.');
const { PGlite } = await import(pathToFileURL(path.resolve(process.argv[2])).href);
const db = new PGlite();
let current = 'fixtures de infraestrutura';
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, email text, encrypted_password text,
      email_confirmed_at timestamptz, created_at timestamptz default now(),
      raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as
      $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
    create table storage.buckets(id text primary key,name text,public boolean,
      file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid() primary key,
      bucket_id text references storage.buckets,name text,owner uuid,metadata jsonb);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as
      $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
    grant usage on schema auth,storage to anon,authenticated,service_role;
    grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
    create publication supabase_realtime;
  `);
  const names = (await fs.readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
  for (const name of names) {
    current = name;
    await db.exec(await fs.readFile('supabase/migrations/' + name, 'utf8'));
  }
  current = 'invariantes do schema final';
  const tables = await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`);
  assert.deepEqual(tables.rows, [], 'Tabela pública sem RLS');
  const views = await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v' and not coalesce(c.reloptions @> array['security_invoker=true'],false)`);
  assert.deepEqual(views.rows, [], 'View pública sem security_invoker');
  if (process.argv.includes('--snapshot')) {
    const snapshot = {};
    for (const [name, query] of Object.entries({
      tables: "select n.nspname as schema,c.relname as name,c.relkind,c.relrowsecurity as rls,c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','void_private') and c.relkind in ('r','v','m') order by 1,2",
      policies: "select * from pg_policies where schemaname in ('public','void_private','storage') order by schemaname,tablename,policyname",
      functions: "select n.nspname as schema,p.proname as name,pg_get_function_identity_arguments(p.oid) as args,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec,has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_exec,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','void_private') and p.prokind='f' order by 1,2",
    })) snapshot[name] = (await db.query(query)).rows;
    await fs.writeFile(process.argv[process.argv.indexOf('--snapshot') + 1], JSON.stringify(snapshot, null, 2));
  }
  console.log(`Schema SQL: ${names.length} migrations reproduzidas; todas as tabelas públicas com RLS e views com security_invoker. Auth/Storage simulados; nenhuma conexão remota.`);
} catch (error) {
  console.error(`Schema SQL falhou em ${current}: ${error.message}`);
  process.exitCode = 1;
} finally { await db.close(); }
