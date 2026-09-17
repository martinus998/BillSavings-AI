-- Run after protect_bill_analysis_results. No customer records are read or changed.
begin;
do $$
begin
  if has_table_privilege('anon', 'public.analyses', 'SELECT')
     or has_table_privilege('authenticated', 'public.analyses', 'SELECT')
     or has_any_column_privilege('anon', 'public.analyses', 'SELECT')
     or has_any_column_privilege('authenticated', 'public.analyses', 'SELECT') then
    raise exception 'Full findings remain directly accessible to a public client';
  end if;
  if has_table_privilege('authenticated', 'public.analyses', 'INSERT')
     or has_table_privilege('authenticated', 'public.analyses', 'UPDATE') then
    raise exception 'Analysis results remain client-writable';
  end if;
  if not has_table_privilege('service_role', 'public.analyses', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'The analysis service lost required access';
  end if;
end $$;
set local role authenticated;
do $$
begin
  begin
    perform findings from public.analyses limit 0;
    raise exception 'Expected direct findings query to be denied';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
