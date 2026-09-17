begin;
do $$
declare affected integer;
begin
  if has_table_privilege('anon', 'public.billing_checkout_access', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated', 'public.billing_checkout_access', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'Checkout receipts must not be exposed to clients';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.billing_checkout_access'::regclass) then
    raise exception 'RLS is required';
  end if;
  if not has_table_privilege('service_role', 'public.billing_checkout_access', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'Service role needs explicit access';
  end if;
  insert into public.billing_checkout_access(session_hash, email)
    values (repeat('e',64), 'synthetic-checkout@example.invalid');
  update public.billing_checkout_access set attempts = 1, next_attempt_at = now() + interval '60 seconds'
    where session_hash = repeat('e',64) and attempts = 0;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'First delivery slot must be acquired'; end if;
  update public.billing_checkout_access set attempts = 1
    where session_hash = repeat('e',64) and attempts = 0;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Same delivery slot must not be acquired twice'; end if;
  insert into public.billing_checkout_access(session_hash, email)
    values (repeat('e',64), 'synthetic-checkout@example.invalid') on conflict (session_hash) do nothing;
  if not exists (select 1 from public.billing_checkout_access where session_hash = repeat('e',64)
    and attempts = 1 and expires_at > now() + interval '23 hours') then
    raise exception 'Retry must preserve send state and expiry';
  end if;
end $$;
rollback;
