-- Webhooks (Pro): per-account or per-drop HTTPS endpoints notified on drop events.
-- Events: drop.viewed, drop.first_opened, lead.captured. Payloads are HMAC-SHA256 signed
-- with the webhook's secret (header X-Hushdrop-Signature: t=<unix>,v1=<hex>).
create table if not exists public.webhooks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  site_id          uuid references public.sites(id) on delete cascade,  -- null = every drop
  url              text not null,
  secret           text not null,
  events           text[] not null default array['drop.first_opened','lead.captured'],
  created_at       timestamptz not null default now(),
  last_delivery_at timestamptz,
  last_status      int,
  failures         int not null default 0,
  disabled_at      timestamptz
);
create index if not exists webhooks_user_idx on public.webhooks(user_id);
create index if not exists webhooks_site_idx on public.webhooks(site_id);
alter table public.webhooks enable row level security;  -- service-role only (api/*)
