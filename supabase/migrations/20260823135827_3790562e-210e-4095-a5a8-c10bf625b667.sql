create or replace function public.import_exec(sql text)
returns void
language plpgsql
security definer
set search_path = public
as $$ begin execute sql; end $$;

revoke all on function public.import_exec(text) from public, anon, authenticated;
grant execute on function public.import_exec(text) to service_role;

-- staging helpers: pin search_path (linter)
create or replace function staging.link1(f jsonb, key text) returns text
language sql immutable set search_path = pg_catalog as $$ select nullif(f -> key ->> 0, '') $$;
create or replace function staging.txt(f jsonb, key text) returns text
language sql immutable set search_path = pg_catalog as $$ select nullif(btrim(coalesce(f ->> key, '')), '') $$;
create or replace function staging.num(f jsonb, key text) returns numeric
language sql immutable set search_path = pg_catalog as $$ select nullif(btrim(coalesce(f ->> key, '')), '')::numeric $$;
create or replace function staging.dt(f jsonb, key text) returns date
language sql immutable set search_path = pg_catalog as $$ select nullif(btrim(coalesce(f ->> key, '')), '')::date $$;
create or replace function staging.ts(f jsonb, key text) returns timestamptz
language sql immutable set search_path = pg_catalog as $$ select nullif(btrim(coalesce(f ->> key, '')), '')::timestamptz $$;