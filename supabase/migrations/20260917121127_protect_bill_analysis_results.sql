-- Full findings are delivered only by the authenticated analyze-bill function,
-- which checks the subscription before returning the free preview or full result.
-- No public client currently reads or writes analyses directly.
begin;
alter table public.analyses enable row level security;
revoke all privileges on table public.analyses from public, anon, authenticated;
-- Explicit column grants, if any exist, are independent of table grants.
do $$
declare columns_sql text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum)
    into columns_sql
    from pg_attribute
    where attrelid = 'public.analyses'::regclass and attnum > 0 and not attisdropped;
  execute format(
    'revoke select (%1$s), insert (%1$s), update (%1$s), references (%1$s) on public.analyses from public, anon, authenticated',
    columns_sql
  );
end $$;
grant select, insert, update, delete on table public.analyses to service_role;
commit;
