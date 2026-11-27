import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);
const db=new PGlite();
try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema void_private;grant usage on schema void_private to service_role;');
 await db.exec(await fs.readFile('supabase/migrations/20261127122815_global_provider_budgets.sql','utf8'));
 for(const role of ['anon','authenticated']){
   const result=await db.query(`select has_function_privilege('${role}','public.void_reserve_provider_budget(text,integer,integer)','EXECUTE') allowed`);
   assert.equal(result.rows[0].allowed,false);
 }
 await db.exec('set role service_role');
 assert.equal((await db.query("select public.void_reserve_provider_budget('tmdb',1,2) n")).rows[0].n,0);
 assert.ok((await db.query("select public.void_reserve_provider_budget('tmdb',1,2) n")).rows[0].n>0);
 await db.exec("reset role;update void_private.provider_budgets set bucket=bucket-interval '2 minutes' where period='minute';set role service_role;");
 assert.equal((await db.query("select public.void_reserve_provider_budget('tmdb',1,2) n")).rows[0].n,0);
 await db.exec("reset role;update void_private.provider_budgets set bucket=bucket-interval '2 minutes' where period='minute';set role service_role;");
 assert.ok((await db.query("select public.void_reserve_provider_budget('tmdb',1,2) n")).rows[0].n>0,'Daily budget survives minute reset');
 console.log('Global budget SQL passed: service-only RPC, shared counter, minute reset and daily cap. No remote connection.');
}finally{await db.close();}
