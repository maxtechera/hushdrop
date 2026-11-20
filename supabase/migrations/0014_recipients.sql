-- Recipient controls (Pro):
--   allow/block lists: entries are emails ("ann@acme.com") or domains ("@acme.com").
--   Any list on a drop turns on the email form; allow = only these may open it.
--   Named links: a guest link (/s/<token>) carries a recipient label, and its opens
--   are counted per link so the owner sees which recipient opened it.
alter table public.sites add column if not exists allow_emails text[];
alter table public.sites add column if not exists block_emails text[];
alter table public.share_tokens add column if not exists label text;
alter table public.share_tokens add column if not exists views bigint not null default 0;
alter table public.share_tokens add column if not exists last_viewed_at timestamptz;
