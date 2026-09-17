-- Only a signed live webhook can create a receipt. A session hash is not an
-- account session and never grants access to documents or paid analysis.
create table public.billing_checkout_access (
  session_hash text primary key check (session_hash ~ '^[0-9a-f]{64}$'),
  email text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  attempts integer not null default 0 check (attempts between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  email_sent_at timestamptz
);
alter table public.billing_checkout_access enable row level security;
revoke all on public.billing_checkout_access from public, anon, authenticated;
grant select, insert, update, delete on public.billing_checkout_access to service_role;
comment on table public.billing_checkout_access is
  'Service-only, expiring checkout proof for rate-limited email delivery. No client grants or policies.';
