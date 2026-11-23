-- A new warm-message cohort should wake its assigned specialists immediately,
-- rather than waiting hours for their previous schedule. Recipient outcomes
-- remain owner-recorded and contain no PII.
create or replace function public.wake_company_warm_outreach_agents()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'active' then
    update public.company_agents
    set next_run_at = now(), updated_at = now()
    where id in ('growth', 'content', 'revenue') and status = 'active';
  end if;
  return new;
end;
$$;

revoke all on function public.wake_company_warm_outreach_agents() from public, anon, authenticated;
grant execute on function public.wake_company_warm_outreach_agents() to service_role;

create trigger company_outreach_batches_wake_agents
after insert on public.company_outreach_batches
for each row execute function public.wake_company_warm_outreach_agents();

update public.company_agents
set next_run_at = now(), updated_at = now()
where id in ('growth', 'content', 'revenue')
  and status = 'active'
  and exists (select 1 from public.company_outreach_batches where status = 'active');

