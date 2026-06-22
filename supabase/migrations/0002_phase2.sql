-- Phase 2: gating + sharing primitives for the hosted tier.
-- Adds per-drop gate metadata, burn-after-read drops, and revocable share tokens.

-- Per-drop gate metadata on hosted sites.
alter table public.sites add column if not exists email_gate text;       -- allowed email domain (null = open)
alter table public.sites add column if not exists feedback boolean not null default false;

-- Burn-after-read: anonymous drops that self-destruct on first view.
-- Content is stored inline (already client-side AES-256 ciphertext) so a single
-- DELETE on read leaves nothing behind — no blob object to orphan.
create table if not exists public.burn_drops (
  slug         text primary key,
  content      text not null,
  content_type text not null default 'text/html; charset=utf-8',
  created_at   timestamptz not null default now()
);
alter table public.burn_drops enable row level security;  -- service-role only

-- Revocable share tokens → guest links to a hosted drop that can be killed
-- without deleting the drop or changing its canonical URL.
create table if not exists public.share_tokens (
  token       text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  handle      text not null,
  slug        text not null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.share_tokens enable row level security;
create index if not exists share_tokens_user_idx on public.share_tokens(user_id);
