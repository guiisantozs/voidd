begin;
-- Client/session timezone must not select a different quota bucket.
alter function void_private.list_limit(text) set timezone='UTC';
commit;
