-- Rate limiting in Postgres (no external store) — keeps the stack Supabase-only.
-- A fixed-window per-key counter with an atomic increment-or-reset RPC.

create table if not exists public.rate_limits (
  key          text primary key,
  count        int not null default 0,
  window_start timestamptz not null default now()
);
alter table public.rate_limits enable row level security;  -- service-role only

-- Atomic: increments the window (or resets it if expired) and returns whether the
-- caller is still within the limit. One round-trip, no read-modify-write race.
create or replace function public.incr_rate_limit(p_key text, p_window_sec int, p_limit int)
returns boolean
language plpgsql
as $$
declare
  v_count int;
begin
  insert into public.rate_limits (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update set
    count = case
      when public.rate_limits.window_start < now() - make_interval(secs => p_window_sec) then 1
      else public.rate_limits.count + 1 end,
    window_start = case
      when public.rate_limits.window_start < now() - make_interval(secs => p_window_sec) then now()
      else public.rate_limits.window_start end
  returning count into v_count;
  return v_count <= p_limit;
end;
$$;
