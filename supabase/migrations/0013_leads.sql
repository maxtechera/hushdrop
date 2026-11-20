-- Lead capture: ask for an email (and optional custom fields, Pro) before a drop opens,
-- and enforce sites.email_gate (only one email domain may open it, verified by a code
-- when email sending is configured).
alter table public.sites add column if not exists lead_capture boolean not null default false;
alter table public.sites add column if not exists lead_fields  jsonb;   -- Pro: ["name","company","phone",...]

create table if not exists public.leads (
  id         bigint generated always as identity primary key,
  site_id    uuid not null references public.sites(id) on delete cascade,
  email      text not null,
  fields     jsonb,
  verified   boolean not null default false,
  country    text,
  created_at timestamptz not null default now()
);
create index if not exists leads_site_idx on public.leads(site_id, created_at desc);
alter table public.leads enable row level security;  -- service-role only

-- One-time codes for the email gate (10 minutes, hashed).
create table if not exists public.lead_codes (
  site_id    uuid not null references public.sites(id) on delete cascade,
  email      text not null,
  code_hash  text not null,
  attempts   int not null default 0,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  primary key (site_id, email)
);
alter table public.lead_codes enable row level security;  -- service-role only
