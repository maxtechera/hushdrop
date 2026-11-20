-- Open alerts: email the owner when a drop is opened.
--   off   = no email
--   first = one email the first time a drop is opened (Free)
--   every = an email for each new viewer (Pro)
-- profiles.notify_opens is the account default; sites.notify_opens overrides it per drop.
alter table public.profiles add column if not exists notify_opens text not null default 'first';
alter table public.sites    add column if not exists notify_opens text;
do $$ begin
  alter table public.profiles add constraint profiles_notify_opens_chk check (notify_opens in ('off','first','every'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.sites add constraint sites_notify_opens_chk check (notify_opens is null or notify_opens in ('off','first','every'));
exception when duplicate_object then null; end $$;
