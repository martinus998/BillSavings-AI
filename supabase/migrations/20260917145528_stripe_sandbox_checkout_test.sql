-- Separate ledger for Stripe sandbox tests. Never grants live paid access.
do $$
declare item text;
begin
  foreach item in array array['subscriptions','pending_entitlements','webhook_events','checkout_access'] loop
    execute format('create table public.%I (like public.%I including defaults including constraints including indexes)', 'billing_sandbox_' || item, 'billing_' || item);
    execute format('alter table public.%I enable row level security', 'billing_sandbox_' || item);
    execute format('revoke all on public.%I from public, anon, authenticated', 'billing_sandbox_' || item);
    execute format('grant select, insert, update, delete on public.%I to service_role', 'billing_sandbox_' || item);
  end loop;
end $$;

alter table public.billing_sandbox_subscriptions alter column livemode set default false;
alter table public.billing_sandbox_subscriptions add constraint sandbox_subscriptions_test_only check (livemode = false);
alter table public.billing_sandbox_pending_entitlements alter column livemode set default false;
alter table public.billing_sandbox_pending_entitlements add constraint sandbox_pending_test_only check (livemode = false);

create function public.billing_sandbox_webhook_secret()
returns text language sql security definer set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'billsavings_sandbox_webhook_20260917'
  limit 1;
$$;
revoke all on function public.billing_sandbox_webhook_secret() from public, anon, authenticated;
grant execute on function public.billing_sandbox_webhook_secret() to service_role;

create function public.claim_sandbox_billing_entitlement()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_pending public.billing_sandbox_pending_entitlements%rowtype;
  v_existing public.billing_sandbox_subscriptions%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select lower(email) into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null then raise exception 'confirmed_email_required'; end if;
  select * into v_pending from public.billing_sandbox_pending_entitlements
    where lower(email) = v_email and livemode = false
      and status in ('active','trialing','past_due')
    order by updated_at desc limit 1;
  if found then
    insert into public.billing_sandbox_subscriptions
      (user_id,stripe_customer_id,stripe_subscription_id,plan,status,current_period_end,livemode,updated_at)
    values (v_uid,v_pending.stripe_customer_id,v_pending.stripe_subscription_id,
      v_pending.plan,v_pending.status,v_pending.current_period_end,false,now())
    on conflict (user_id) do update set
      stripe_customer_id=excluded.stripe_customer_id,
      stripe_subscription_id=excluded.stripe_subscription_id,
      plan=excluded.plan,status=excluded.status,current_period_end=excluded.current_period_end,
      livemode=false,updated_at=now();
    delete from public.billing_sandbox_pending_entitlements where id=v_pending.id;
  end if;
  select * into v_existing from public.billing_sandbox_subscriptions where user_id=v_uid;
  if not found then return jsonb_build_object('ok',true,'sandbox',true,'plan','free','status','inactive'); end if;
  return jsonb_build_object('ok',true,'sandbox',true,'plan',v_existing.plan,'status',v_existing.status,
    'current_period_end',v_existing.current_period_end);
end;
$$;
revoke all on function public.claim_sandbox_billing_entitlement() from public, anon;
grant execute on function public.claim_sandbox_billing_entitlement() to authenticated;
