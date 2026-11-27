import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
if(!process.argv[2])throw Error('Informe o caminho do módulo PGlite temporário.');
const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);
const db=new PGlite();
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema void_private;
 create table auth.users(id uuid primary key,created_at timestamptz default now());
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,void_private to anon,authenticated;`);
 for(const file of ['202610200001_accounts.sql','20261020142708_movie_community.sql'])await db.exec(await fs.readFile('supabase/migrations/'+file,'utf8'));
 const profiles=await fs.readFile('supabase/migrations/20261020192337_user_profiles_follows.sql','utf8');
 await db.exec(profiles.slice(0,profiles.indexOf('create function void_private.profile_defaults'))+profiles.slice(profiles.indexOf('create table public.follows'),profiles.indexOf('create table public.profile_favorites'))+'commit;');
 const interactions=await fs.readFile('supabase/migrations/20261020185807_movie_detail_reviews.sql','utf8');
 await db.exec(interactions.slice(0,interactions.indexOf('-- Atomic per-account/minute limits'))+'commit;');
 await db.exec(interactions.slice(interactions.indexOf('create function public.void_movie_review_comments'),interactions.indexOf('revoke all on function public.void_detail_friend_ids'))+`revoke all on function public.void_movie_review_comments(text,uuid,integer) from public;grant execute on function public.void_movie_review_comments(text,uuid,integer) to anon,authenticated;`);
 // Current rating constraint supports zero and tenths; keep the rest of its
 // canonical item checks while avoiding unrelated historical migrations.
 await db.exec(`alter table public.void_records drop constraint payload_shape;
 alter table public.void_records add constraint payload_shape check(payload is null or ((payload->>'nota')::numeric between 0 and 5 and mod((payload->>'nota')::numeric*10,1)=0) or kind<>'review');`);
 await db.exec('alter table public.void_community_profiles add column avatar_id uuid;');
 const before=(await db.query('select count(*) count from public.void_records')).rows;
 await db.exec(await fs.readFile('supabase/migrations/20261027112631_games_reviews_feed.sql','utf8'));
 assert.deepEqual((await db.query('select count(*) count from public.void_records')).rows,before);
 await db.exec(await fs.readFile('supabase/tests/reviews-feed.sql','utf8'));
 console.log('SQL passed: feed privacy, accepted friends, all filters, cursor sorts, aggregates, zero ratings, opt-in status, comments/likes, private library isolation and movie compatibility.');
}catch(error){console.error('SQL failed:',error.message);process.exitCode=1;}finally{await db.close();}
