-- 0004: Close the Supabase "RLS disabled in public" alert (2026-06-22).
-- device_codes was created in 0001 without RLS; it holds a raw `api_key` for a
-- ~10-min window, so a leaked anon key could read it via PostgREST.
--
-- All app access goes through the service role (api/*), which bypasses RLS, and
-- the browser only uses Supabase Auth (no direct table queries) — so enabling
-- RLS with no anon/authenticated policies = deny-all for public, no app impact.
-- Idempotent: loops over every public table still missing RLS.
do $$
declare r record;
begin
  for r in
    select tablename from pg_tables
    where schemaname = 'public' and rowsecurity = false
  loop
    execute format('alter table public.%I enable row level security;', r.tablename);
    raise notice 'enabled RLS on public.%', r.tablename;
  end loop;
end $$;

-- Explicit so intent is greppable even if 0001 is edited later.
alter table public.device_codes enable row level security;

-- Follow-up (separate change, not required to clear the alert): device_codes.api_key
-- is stored in plaintext until poll.mjs nulls it. Consider minting the key only at
-- claim time so it never lands in Postgres. Tracked outside this migration.
