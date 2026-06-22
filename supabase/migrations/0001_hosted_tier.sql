-- drop hosted tier — accounts, API keys, sites, device-pairing
-- Apply: supabase db push (after `supabase link` to the drops project)

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  handle     text unique,
  plan       text not null default 'free',
  created_at timestamptz not null default now()
);

create table if not exists public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  key_hash     text unique not null,
  prefix       text not null,
  label        text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index if not exists api_keys_user_idx on public.api_keys(user_id);

create table if not exists public.sites (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null,
  handle       text not null,
  user_id      uuid references auth.users(id) on delete cascade,
  blob_key     text not null,
  content_type text,
  size_bytes   bigint default 0,
  locked       boolean default false,
  expires_at   timestamptz,
  views        bigint default 0,
  created_at   timestamptz not null default now(),
  unique (handle, slug)
);
create index if not exists sites_user_idx on public.sites(user_id);
create index if not exists sites_expires_idx on public.sites(expires_at);

-- ephemeral CLI device-pairing codes (single-use, 10-min TTL)
create table if not exists public.device_codes (
  code       text primary key,
  user_id    uuid references auth.users(id) on delete cascade,
  api_key    text,                       -- raw key, delivered once to the CLI then nulled
  status     text not null default 'pending',  -- pending | approved | denied
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes')
);

-- RLS: all app access goes through the service role (api/*); these policies are defense-in-depth
-- so a leaked anon key can only read a user's own rows.
alter table public.profiles  enable row level security;
alter table public.api_keys  enable row level security;
alter table public.sites     enable row level security;
create policy "own profile"  on public.profiles for select using (auth.uid() = user_id);
create policy "own keys"     on public.api_keys for select using (auth.uid() = user_id);
create policy "own sites"    on public.sites    for select using (auth.uid() = user_id);
