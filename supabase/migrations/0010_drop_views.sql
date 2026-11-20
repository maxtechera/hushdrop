-- Per-drop view tracking for hosted drops: views, unique viewers, first/last opened,
-- referrers and country. Feeds `hush stats`, the dashboard, open alerts and webhooks.
--
-- Privacy: no IP is stored. `viewer` is a daily-rotating hash of IP + user agent made at
-- the edge, so "unique viewers" means unique per day. Drop contents are never read.
-- Additive and idempotent; safe to apply before or after 0005/0006.

alter table public.sites add column if not exists first_viewed_at timestamptz;
alter table public.sites add column if not exists last_viewed_at  timestamptz;
alter table public.sites add column if not exists unique_viewers  bigint not null default 0;

create table if not exists public.drop_views (
  id         bigint generated always as identity primary key,
  site_id    uuid not null references public.sites(id) on delete cascade,
  viewer     text not null,
  country    text,
  referrer   text,
  is_mobile  boolean not null default false,
  email      text,                         -- set when the viewer passed a lead/email gate
  created_at timestamptz not null default now()
);
create index if not exists drop_views_site_idx on public.drop_views(site_id, created_at desc);
create index if not exists drop_views_site_viewer_idx on public.drop_views(site_id, viewer);
alter table public.drop_views enable row level security;  -- service-role only (api/*)

-- Record one view atomically and report whether it was the drop's first open and a new
-- viewer, so callers can fire "first open" alerts and webhooks exactly once.
create or replace function public.record_drop_view(
  p_handle text, p_slug text, p_viewer text, p_country text, p_referrer text, p_mobile boolean, p_email text default null
) returns json
language plpgsql
as $$
declare
  v_site   public.sites%rowtype;
  v_new    boolean;
  v_first  boolean;
begin
  select * into v_site from public.sites where handle = p_handle and slug = p_slug for update;
  if not found then return null; end if;
  v_first := v_site.first_viewed_at is null;
  v_new := not exists (select 1 from public.drop_views where site_id = v_site.id and viewer = p_viewer);
  insert into public.drop_views (site_id, viewer, country, referrer, is_mobile, email)
  values (v_site.id, p_viewer, p_country, p_referrer, coalesce(p_mobile, false), p_email);
  update public.sites set
    views = coalesce(views, 0) + 1,
    unique_viewers = unique_viewers + (case when v_new then 1 else 0 end),
    first_viewed_at = coalesce(first_viewed_at, now()),
    last_viewed_at = now()
  where id = v_site.id;
  return json_build_object(
    'site_id', v_site.id, 'user_id', v_site.user_id, 'handle', v_site.handle, 'slug', v_site.slug,
    'first_view', v_first, 'new_viewer', v_new, 'views', coalesce(v_site.views, 0) + 1
  );
end;
$$;
revoke all on function public.record_drop_view(text, text, text, text, text, boolean, text) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.record_drop_view(text, text, text, text, text, boolean, text) to service_role;
  end if;
end $$;
